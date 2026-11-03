import WebSocket from "ws";
import { encode, decode } from "@msgpack/msgpack";

const FISH_WS_URL = "wss://api.fish.audio/v1/tts/live";
export const FISH_SAMPLE_RATE = Number(process.env.FISH_SAMPLE_RATE || 24000);
const STALL_TIMEOUT_MS = Number(process.env.FISH_STALL_TIMEOUT_MS || 15000);

/** One Fish Audio live-TTS websocket session for a single turn. */
export class FishTtsStream {
  constructor({ voiceModelId, webSocketFactory } = {}) {
    this.voiceModelId = voiceModelId || process.env.FISH_MODEL_ID;
    this._createWebSocket =
      webSocketFactory || ((url, options) => new WebSocket(url, options));
    this.ws = null;
    this._openPromise = null;
    this._queue = [];
    this._waiters = [];
    this._finished = false;
    this._error = null;
    // Bug found 2026-08-22: the stall-timeout below used to start ticking
    // the instant audioFrames() began iterating, i.e. the moment the
    // connection opened -- before any text had even been sent to Fish.
    // A real turn opens the connection and starts reading audio
    // concurrently with the LLM still generating the first clause (see
    // call.js's speakStream); if that first clause took longer than the
    // timeout to arrive from Gemini/Pollinations, this gave up on Fish
    // for a reason that had nothing to do with Fish -- we simply hadn't
    // asked it to say anything yet. Track whether we've actually sent
    // Fish anything; only count silence AFTER that as a real stall.
    this._sentAnything = false;
  }

  _push(item) {
    const waiter = this._waiters.shift();
    if (waiter) waiter(item);
    else this._queue.push(item);
  }

  _finish(error = null) {
    if (this._finished) return;
    this._finished = true;
    this._error = error;
    while (this._waiters.length) {
      this._waiters.shift()({ finished: true, error });
    }
  }

  _next() {
    if (this._queue.length) return Promise.resolve(this._queue.shift());
    if (this._finished) {
      return Promise.resolve({ finished: true, error: this._error });
    }
    return new Promise((resolve) => this._waiters.push(resolve));
  }

  open() {
    if (this._openPromise) return this._openPromise;

    this._openPromise = new Promise((resolve, reject) => {
      const ws = this._createWebSocket(FISH_WS_URL, {
        headers: {
          Authorization: `Bearer ${process.env.FISH_API_KEY}`,
          model: process.env.FISH_MODEL || "s2.1-pro-free",
        },
      });
      this.ws = ws;
      ws.binaryType = "arraybuffer";

      // Attach reception before sending the start event. Fish can return
      // audio immediately; registering these handlers only when audioFrames()
      // was first iterated raced with text/flush/stop and dropped fast events.
      ws.on("message", (data) => {
        try {
          const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
          const msg = decode(bytes);
          if (msg.event === "audio") {
            this._push({ audio: msg.audio });
          } else if (msg.event === "finish") {
            this._finish(
              msg.reason === "error" ? new Error("Fish TTS session failed") : null
            );
          } else if (msg.event === "error") {
            // Bug found 2026-08-22, confirmed against the live API: an
            // invalid reference_id (e.g. a bad voice preset) makes Fish
            // send {"event":"error", ...} and then NOTHING else -- no
            // "finish", connection just sits open. This code previously
            // only understood "audio" and "finish", so this message was
            // silently ignored and the stream hung until the stall
            // timeout gave up 15s later with no explanation. Now it
            // fails immediately with the real reason.
            this._finish(new Error(`Fish TTS error: ${msg.error || "unknown"}`));
          }
        } catch (error) {
          this._finish(error);
        }
      });
      ws.on("close", () => this._finish());
      ws.on("error", (error) => this._finish(error));

      let settled = false;
      ws.once("open", () => {
        settled = true;
        ws.send(
          encode({
            event: "start",
            request: {
              text: "",
              reference_id: this.voiceModelId,
              format: "pcm",
              sample_rate: FISH_SAMPLE_RATE,
              latency: process.env.FISH_LATENCY || "balanced",
              normalize: true,
              chunk_length: 120,
              min_chunk_length: 40,
            },
          })
        );
        resolve(ws);
      });
      ws.once("error", (error) => {
        if (!settled) reject(error);
      });
    });

    return this._openPromise;
  }

  async sendText(text) {
    const ws = await this.open();
    this._sentAnything = true;
    ws.send(encode({ event: "text", text: `${text} ` }));
  }

  async flush() {
    const ws = await this.open();
    this._sentAnything = true;
    ws.send(encode({ event: "flush" }));
  }

  async stop() {
    if (!this.ws) return;
    const ws = await this.open();
    ws.send(encode({ event: "stop" }));
  }

  close() {
    this.ws?.close();
  }

  /** Async-iterates every buffered PCM frame until Fish sends finish.
   * Reception starts when the socket is created, not when iteration starts,
   * so callers may safely send text/flush/stop before consuming frames. */
  async *audioFrames() {
    await this.open();

    while (true) {
      let timeout;
      const item = await Promise.race([
        this._next(),
        new Promise((resolve) => {
          timeout = setTimeout(
            () => resolve({ timedOut: true }),
            STALL_TIMEOUT_MS
          );
        }),
      ]);
      clearTimeout(timeout);

      if (item.timedOut) {
        if (!this._sentAnything) {
          // Not a stall -- we simply haven't sent Fish any text yet (the
          // LLM is still generating the first clause). Keep waiting; the
          // call-level watchdog (SESSION_MAX_SECONDS) is the real ceiling
          // here, not this connection-level timer.
          continue;
        }
        console.error(
          "[voice-agent] Fish TTS stalled with no finish/audio for",
          STALL_TIMEOUT_MS,
          "ms after sending text -- giving up on this turn's audio"
        );
        return;
      }
      if (item.finished) {
        if (item.error) throw item.error;
        return;
      }
      yield item.audio;
    }
  }
}
