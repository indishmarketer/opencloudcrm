import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { performSignedHttpDelivery, deliverWebhookAttempt, createPinnedDispatcher, WEBHOOK_USER_AGENT } from "../src/lib/webhookDelivery.ts";
import { verifyWebhookSignature } from "../src/lib/webhookSigning.ts";

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}/hook` });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

test("delivers successfully to a 2xx endpoint with a reproducible, verifiable signature", async () => {
  let receivedHeaders = null;
  let receivedBody = "";
  const { server, url } = await startServer((req, res) => {
    receivedHeaders = req.headers;
    req.on("data", (chunk) => (receivedBody += chunk));
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"received":true}');
    });
  });
  try {
    const bodyJson = JSON.stringify({ event_type: "course.enrolled" });
    const result = await performSignedHttpDelivery({
      url,
      secret: "test-secret",
      eventUuid: "evt-1",
      eventType: "course.enrolled",
      bodyJson,
    });
    assert.equal(result.outcome, "delivered");
    assert.equal(result.httpStatus, 200);
    assert.equal(result.responseExcerpt, '{"received":true}');
    assert.equal(receivedBody, bodyJson);
    assert.equal(receivedHeaders["x-im-webhook-event-id"], "evt-1");
    assert.equal(receivedHeaders["x-im-webhook-event-type"], "course.enrolled");
    assert.ok(receivedHeaders["x-im-webhook-timestamp"]);
    assert.equal(receivedHeaders["user-agent"], WEBHOOK_USER_AGENT);
    const verified = verifyWebhookSignature(
      "test-secret",
      receivedHeaders["x-im-webhook-timestamp"],
      receivedBody,
      receivedHeaders["x-im-webhook-signature"],
    );
    assert.equal(verified, true);
  } finally {
    await closeServer(server);
  }
});

test("classifies a 429 response as retryable and captures the response excerpt", async () => {
  const { server, url } = await startServer((req, res) => {
    res.writeHead(429, { "content-type": "text/plain" });
    res.end("slow down");
  });
  try {
    const result = await performSignedHttpDelivery({
      url,
      secret: "s",
      eventUuid: "evt-2",
      eventType: "test.ping",
      bodyJson: "{}",
    });
    assert.equal(result.outcome, "retryable_failure");
    assert.equal(result.httpStatus, 429);
    assert.equal(result.responseExcerpt, "slow down");
  } finally {
    await closeServer(server);
  }
});

test("classifies a 400 response as a permanent failure", async () => {
  const { server, url } = await startServer((req, res) => {
    res.writeHead(400, { "content-type": "text/plain" });
    res.end("bad request");
  });
  try {
    const result = await performSignedHttpDelivery({
      url,
      secret: "s",
      eventUuid: "evt-3",
      eventType: "test.ping",
      bodyJson: "{}",
    });
    assert.equal(result.outcome, "permanent_failure");
    assert.equal(result.httpStatus, 400);
  } finally {
    await closeServer(server);
  }
});

test("classifies a 500 response as retryable", async () => {
  const { server, url } = await startServer((req, res) => {
    res.writeHead(500);
    res.end("server error");
  });
  try {
    const result = await performSignedHttpDelivery({
      url,
      secret: "s",
      eventUuid: "evt-4",
      eventType: "test.ping",
      bodyJson: "{}",
    });
    assert.equal(result.outcome, "retryable_failure");
    assert.equal(result.httpStatus, 500);
  } finally {
    await closeServer(server);
  }
});

test("a hanging endpoint times out and is classified as retryable", async () => {
  const { server, url } = await startServer((_req, _res) => {
    // Deliberately never responds.
  });
  try {
    const result = await performSignedHttpDelivery({
      url,
      secret: "s",
      eventUuid: "evt-5",
      eventType: "test.ping",
      bodyJson: "{}",
      timeoutMs: 200,
    });
    assert.equal(result.outcome, "retryable_failure");
    assert.equal(result.httpStatus, null);
    assert.ok(result.errorMessage);
  } finally {
    await closeServer(server);
  }
});

test("createPinnedDispatcher's lookup callback actually connects (regression: Node's Happy Eyeballs path calls lookup with options.all and expects the array-form callback)", async () => {
  const { server } = await startServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"pinned":true}');
  });
  try {
    const { port } = server.address();
    const dispatcher = createPinnedDispatcher("127.0.0.1", 4);
    try {
      const result = await performSignedHttpDelivery({
        // Deliberately a different hostname than the pinned address to prove
        // the custom lookup, not the hostname, decided where the connection
        // actually went.
        url: `http://pinned-dispatcher-test.invalid:${port}/hook`,
        secret: "s",
        eventUuid: "evt-7",
        eventType: "test.ping",
        bodyJson: "{}",
        dispatcher,
      });
      assert.equal(result.outcome, "delivered");
      assert.equal(result.httpStatus, 200);
    } finally {
      await dispatcher.close();
    }
  } finally {
    await closeServer(server);
  }
});

test("deliverWebhookAttempt rejects a loopback destination before ever connecting (SSRF gate wired into the real path)", async () => {
  const result = await deliverWebhookAttempt({
    url: "http://127.0.0.1:9/hook", // port 9 (discard) -- would refuse anyway, proving the SSRF check short-circuits first
    secret: "s",
    eventUuid: "evt-6",
    eventType: "test.ping",
    bodyJson: "{}",
  });
  assert.equal(result.outcome, "permanent_failure");
  assert.equal(result.httpStatus, null);
  assert.ok(/private|loopback|link-local/i.test(result.errorMessage || ""));
});
