// Starts the Next.js standalone server, but shuts it down politely.
//
// Why this file exists at all: during a Coolify rolling update the old
// container is removed while Traefik may still be mid-request against it.
// Measured on indishmarketer.com by sampling the live site ~10 times a
// second through a real deploy, that produced two distinct failures:
//
//   1. A fast 502, because Traefik briefly kept a removed container in
//      its pool and the connection was refused. Fixed at the proxy: a
//      `retry` middleware on both Traefik entrypoints re-dispatches a
//      refused connection to the healthy container. Closing our listener
//      early (below) is what makes those connections refuse *fast*, which
//      is exactly the case that middleware handles well.
//
//   2. A 20 second hang. The connection had already been accepted, then
//      the process died before sending any response headers. Traefik sees
//      no connection error, so retry cannot help, and its
//      responseHeaderTimeout is infinite by default, so it simply waits.
//      That one is this file's job: finish what we already accepted
//      before the socket goes away, so nothing is ever left mid-sentence.
//
// Next.js installs its own SIGTERM handler that calls process.exit(143)
// immediately, killing in-flight requests. See
// node_modules/next/dist/server/lib/start-server.js -- it skips that only
// when NEXT_MANUAL_SIG_HANDLE is set, which the Dockerfile sets. Because
// of that, this file MUST install handlers of its own: node runs as PID 1
// in the container, and PID 1 has no default signal dispositions, so a
// missed SIGTERM means the container hangs until Docker's SIGKILL.
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Must stay comfortably under Docker's stop timeout (10s by default),
// otherwise SIGKILL lands mid-drain and we are back where we started. A
// warm page render here is ~300ms, so this is roughly 25x what a real
// in-flight request needs.
const DRAIN_MS = Number(process.env.SHUTDOWN_DRAIN_MS || 8000);

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// start-server.js reaches the server through `require("http").createServer`,
// and never hands it back to the caller, so patching the module's own
// function is the only way to get a reference to it. The CJS `http` module
// object is shared with this ESM import, so assigning here is what that
// require sees.
let httpServer = null;
const openSockets = new Set();
const originalCreateServer = http.createServer;
http.createServer = function createServerCapturingFirst(...args) {
  const server = originalCreateServer.apply(this, args);
  if (!httpServer) {
    httpServer = server;
    server.on("connection", (socket) => {
      openSockets.add(socket);
      socket.once("close", () => openSockets.delete(socket));
    });
  }
  return server;
};

let shuttingDown = false;

function shutdown(signal, exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;

  if (!httpServer) {
    process.exit(exitCode);
    return;
  }

  console.log(`[shutdown] ${signal}: draining, up to ${DRAIN_MS}ms`);
  const startedAt = Date.now();
  let settled = false;

  function finish(reason) {
    if (settled) return;
    settled = true;
    clearInterval(idleReaper);
    clearTimeout(hardStop);
    console.log(`[shutdown] ${reason} after ${Date.now() - startedAt}ms`);
    process.exit(exitCode);
  }

  // Stop accepting new connections first. Anything arriving from here on
  // is refused immediately rather than accepted and abandoned, which is
  // the failure the proxy's retry middleware is good at absorbing.
  httpServer.close(() => finish("all in-flight requests completed"));

  // close() alone never resolves while keep-alive sockets sit idle, and
  // Cloudflare holds those open. Reap them as they fall idle; sockets in
  // the middle of a request are left alone.
  httpServer.closeIdleConnections();
  const idleReaper = setInterval(() => httpServer.closeIdleConnections(), 150);

  const hardStop = setTimeout(() => {
    httpServer.closeAllConnections?.();
    for (const socket of openSockets) socket.destroy();
    finish(`drain window of ${DRAIN_MS}ms elapsed, forced remaining sockets closed`);
  }, DRAIN_MS);
}

process.on("SIGTERM", () => shutdown("SIGTERM", 143));
process.on("SIGINT", () => shutdown("SIGINT", 130));

await import(pathToFileURL(path.join(appRoot, "server.js")).href);
