// Starts the Next.js standalone server, but shuts it down politely.
//
// Why this file exists: during a Coolify rolling update the old container
// is removed while Traefik may still be mid-request against it. Measured
// on indishmarketer.com by sampling the live site ~10 times a second
// through real deploys, that produced two distinct failures:
//
//   1. A fast 502, because Traefik briefly kept a removed container in
//      its pool and the connection was refused. Fixed at the proxy, with
//      a `retry` middleware on both Traefik entrypoints that re-dispatches
//      a refused connection to the healthy container.
//
//   2. A 20 second hang. The connection had already been accepted, then
//      the process died before sending any response headers. Traefik sees
//      no connection error, so retry cannot help, and its
//      responseHeaderTimeout is infinite by default, so it simply waits.
//      That one is this file's job.
//
// Next.js installs a SIGTERM handler that calls process.exit(143) the
// instant the signal lands, killing whatever is in flight. See
// node_modules/next/dist/server/lib/start-server.js -- it skips that only
// when NEXT_MANUAL_SIG_HANDLE is set, which the Dockerfile sets. Because
// of that, this file MUST install handlers of its own: node runs as PID 1
// in the container, and PID 1 has no default signal dispositions, so a
// missed SIGTERM means the container hangs until Docker's SIGKILL.
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Total budget. Must stay comfortably under Docker's stop timeout (10s by
// default) or SIGKILL lands mid-drain and we are back where we started.
const DRAIN_MS = Number(process.env.SHUTDOWN_DRAIN_MS || 8000);

// How long to keep serving completely normally after SIGTERM, before
// closing the listener.
//
// This delay is the whole trick, and it is not just politeness. Since
// node 19, server.close() does not merely stop accepting new connections,
// it also destroys the idle ones. "Idle" is a weaker claim than it
// sounds: a connection counts as idle the moment the last byte of its
// response is written into the socket, which is not the same as the
// client having received it. Any response small enough to fit the kernel
// send buffer is therefore idle immediately, and closing destroys it with
// that buffer unflushed.
//
// That is not hypothetical. An earlier version of this file called
// close() straight away and truncated a 10728 byte file at 4171 bytes for
// a client reading slowly, while logging "all in-flight requests
// completed after 0ms". Serving normally for a beat first lets those
// written responses actually reach their clients.
//
// Still accepting new connections during the window is a feature rather
// than a cost: Traefik may well still be routing to us, and a request
// served is better than a request refused.
const SETTLE_MS = Number(process.env.SHUTDOWN_SETTLE_MS || 1500);

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// start-server.js reaches the server through `require("http").createServer`
// and never hands it back to the caller, so patching the module's own
// function is the only way to get a reference. The CJS `http` module
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

  const startedAt = Date.now();
  let settled = false;
  console.log(
    `[shutdown] ${signal}: serving normally for ${SETTLE_MS}ms, then draining, ${DRAIN_MS}ms total`,
  );

  function finish(reason) {
    if (settled) return;
    settled = true;
    clearTimeout(closeTimer);
    clearTimeout(hardStop);
    console.log(`[shutdown] ${reason} after ${Date.now() - startedAt}ms`);
    process.exit(exitCode);
  }

  // After the settle window, stop listening. Connections still carrying a
  // request are not idle, so close() leaves them alone and its callback
  // waits for them. Anything arriving after this point is refused
  // outright, which is precisely the case the proxy's retry middleware
  // absorbs cleanly.
  const closeTimer = setTimeout(() => {
    httpServer.close(() => finish("in-flight requests completed, listener closed"));
  }, SETTLE_MS);

  const hardStop = setTimeout(() => {
    httpServer.closeAllConnections?.();
    for (const socket of openSockets) socket.destroy();
    finish(`drain budget of ${DRAIN_MS}ms elapsed, forced remaining sockets closed`);
  }, DRAIN_MS);
}

process.on("SIGTERM", () => shutdown("SIGTERM", 143));
process.on("SIGINT", () => shutdown("SIGINT", 130));

await import(pathToFileURL(path.join(appRoot, "server.js")).href);
