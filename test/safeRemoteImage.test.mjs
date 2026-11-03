import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { request } from "undici";
import { createPinnedImageDispatcher } from "../src/lib/safeRemoteImage.ts";

test("the image fetcher's pinned DNS callback supports Node's options.all connection path", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "image/png" });
    res.end("image-bytes");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const dispatcher = createPinnedImageDispatcher("127.0.0.1", 4);
    try {
      const response = await request(`http://course-cover-test.invalid:${address.port}/cover`, { dispatcher });
      assert.equal(response.statusCode, 200);
      await response.body.dump();
    } finally {
      await dispatcher.close();
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
