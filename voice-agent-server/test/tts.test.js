import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { decode, encode } from "@msgpack/msgpack";
import { FishTtsStream } from "../src/tts.js";

class ImmediateFishSocket extends EventEmitter {
  constructor() {
    super();
    this.sentEvents = [];
    this.binaryType = "";
    queueMicrotask(() => this.emit("open"));
  }

  send(bytes) {
    const message = decode(bytes);
    this.sentEvents.push(message.event);

    // Deliberately respond synchronously to stop. The old implementation
    // attached its message listener later in audioFrames(), losing both.
    if (message.event === "stop") {
      this.emit(
        "message",
        encode({ event: "audio", audio: new Uint8Array([1, 2, 3, 4]) })
      );
      this.emit("message", encode({ event: "finish", reason: "stop" }));
    }
  }

  close() {
    this.emit("close");
  }
}

test("buffers Fish audio and finish events emitted before consumption starts", async () => {
  const socket = new ImmediateFishSocket();
  const stream = new FishTtsStream({
    voiceModelId: "test-voice",
    webSocketFactory: () => socket,
  });

  await stream.open();
  await stream.sendText("Second response");
  await stream.flush();
  await stream.stop();

  const frames = [];
  for await (const frame of stream.audioFrames()) frames.push([...frame]);

  assert.deepEqual(frames, [[1, 2, 3, 4]]);
  assert.deepEqual(socket.sentEvents, ["start", "text", "flush", "stop"]);
});

test("surfaces Fish finish errors instead of silently ending audio", async () => {
  class ErrorFishSocket extends ImmediateFishSocket {
    send(bytes) {
      const message = decode(bytes);
      this.sentEvents.push(message.event);
      if (message.event === "stop") {
        this.emit("message", encode({ event: "finish", reason: "error" }));
      }
    }
  }

  const socket = new ErrorFishSocket();
  const stream = new FishTtsStream({ webSocketFactory: () => socket });
  await stream.open();
  await stream.sendText("Failure");
  await stream.stop();

  try {
    for await (const _ of stream.audioFrames()) {
      // No frames expected
    }
  } catch (error) {
    if (!/Fish TTS session failed/.test(error.message)) {
      throw new Error(`Expected Fish TTS session failed, but got: ${error.message}`);
    }
    return; // Success!
  }

  throw new Error(`Expected audioFrames to throw an error, but it successfully finished! Stream state: finished=${stream._finished}, error=${stream._error}`);
});
