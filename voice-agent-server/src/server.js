import http from "node:http";
import crypto from "node:crypto";
import { WebSocketServer } from "ws";
import { verifyCallToken, claimSttToken, reserveSession } from "./session.js";
import { mintAssemblyAiToken, assemblyAiWsUrl } from "./stt.js";
import { Call } from "./call.js";

const PORT = Number(process.env.PORT || 4000);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === "production" && ALLOWED_ORIGINS.length === 0) {
  throw new Error("ALLOWED_ORIGINS must be configured in production");
}

function ipHash(req) {
  const ip = req.headers["cf-connecting-ip"] || req.socket.remoteAddress || "";
  return crypto.createHmac("sha256", process.env.SESSION_SECRET || "dev").update(ip).digest("hex");
}

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] || "";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Credentials": "true",
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  // This backend has no visitor-facing page of its own -- it's the call
  // engine indishmarketer.com/products/voice-agent talks to behind the
  // scenes. A friendly note here instead of a bare "not found" for anyone
  // who opens the URL directly to check it's alive.
  if (url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Indish Marketer voice agent backend is running. This is not a visitor page -- see indishmarketer.com/products/voice-agent.");
    return;
  }

  // Issues the one-time AssemblyAI streaming token the browser connects to
  // AssemblyAI with directly. Gated by the same call-session token as the
  // WS itself, so this can't be used to mint tokens outside a real session.
  if (url.pathname === "/stt-token" && req.method === "GET") {
    const headers = corsHeaders(req.headers.origin);
    if (!ALLOWED_ORIGINS.includes(req.headers.origin)) {
      res.writeHead(403, headers);
      res.end("origin not allowed");
      return;
    }
    const authorization = req.headers.authorization || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
    const auth = await verifyCallToken(token);
    if (!auth) {
      res.writeHead(401, headers);
      res.end("invalid token");
      return;
    }
    if (!(await claimSttToken(auth.userId, auth.jti))) {
      res.writeHead(409, headers);
      res.end("token already used");
      return;
    }
    try {
      const aaiToken = await mintAssemblyAiToken();
      res.writeHead(200, { ...headers, "Content-Type": "application/json" });
      res.end(JSON.stringify({ wsUrl: assemblyAiWsUrl(aaiToken) }));
    } catch (err) {
      console.error("[voice-agent] stt-token failed:", err);
      res.writeHead(502, headers);
      res.end("stt token mint failed");
    }
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

server.on("upgrade", async (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== "/call") {
    socket.destroy();
    return;
  }

  const origin = req.headers.origin;
  if (!ALLOWED_ORIGINS.includes(origin)) {
    socket.destroy();
    return;
  }

  const token = url.searchParams.get("token");
  const auth = await verifyCallToken(token);
  if (!auth) {
    socket.destroy();
    return;
  }

  let sessionId;
  try {
    sessionId = await reserveSession({
      userId: auth.userId,
      jti: auth.jti,
      isAdmin: auth.isAdmin,
      ipHash: ipHash(req),
    });
  } catch {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, async (ws) => {
    new Call(ws, { sessionId, userId: auth.userId });
  });
});

server.listen(PORT, () => {
  console.log(`[voice-agent] listening on :${PORT}`);
});
