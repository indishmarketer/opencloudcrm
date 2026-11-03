import { getSettings } from "./db.js";
import { sentences } from "./llm.js";
import { FishTtsStream } from "./tts.js";
import { buildSystemPrompt } from "./prompts.js";
import { sessionMaxSeconds, recordSessionEnd } from "./session.js";
import { extractAndSaveLead } from "./leads.js";

const GREETING = process.env.GREETING || "Hi, how can I help you today?";

/** One live call: owns the receive loop for the browser<->server control
 * websocket, and runs each turn as a background task (not awaited inline)
 * so a `barge_in` can be handled the instant it arrives instead of only
 * after the current turn finishes. Ported from the reference repo's
 * app/main.py `_run_call` / `Call`. */
export class Call {
  constructor(ws, { sessionId, userId }) {
    this.ws = ws;
    this.sessionId = sessionId;
    this.userId = userId;
    this.history = []; // [{role:'user'|'assistant', text}]
    this.currentTurnAbort = null;
    this.turnRunning = false;
    this.pendingUserText = null;
    this.started = false;
    this.startedAt = Date.now();
    this.endReason = "client_closed";

    this.watchdog = setTimeout(() => {
      this.endReason = "max_duration";
      this.send({ type: "ended", reason: "max_duration", message: "Call time limit reached." });
      ws.close();
    }, sessionMaxSeconds() * 1000);

    ws.on("message", (raw) => this.onMessage(raw));
    ws.on("close", () => this.onClose());
  }

  send(obj) {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(obj));
  }

  sendAudio(buffer) {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(buffer);
  }

  async onMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "start") {
      if (this.started) return;
      this.started = true;
      this.turnRunning = true;
      const abortToken = { aborted: false };
      this.currentTurnAbort = abortToken;
      void this.turnFromGreeting(abortToken).finally(() => {
        this.turnRunning = false;
        const pending = this.pendingUserText;
        this.pendingUserText = null;
        if (pending && this.ws.readyState === this.ws.OPEN) this.startTurn(pending);
      });
    } else if (msg.type === "user_turn" && typeof msg.text === "string" && msg.text.trim()) {
      if (!this.started) return;
      const text = msg.text.trim();
      if (text.length > 2000) {
        this.send({ type: "error", message: "That message is too long." });
        return;
      }
      if (this.turnRunning) {
        this.stopSpeaking();
        this.pendingUserText = text;
        return;
      }
      this.startTurn(text);
    } else if (msg.type === "barge_in") {
      this.stopSpeaking();
    } else if (msg.type === "end") {
      this.endReason = "client_end";
      this.ws.close();
    }
    // stt_usage is accepted but not persisted separately -- session duration
    // (recorded on close) is the billing/quota signal that matters here.
  }

  stopSpeaking() {
    if (this.currentTurnAbort) this.currentTurnAbort.aborted = true;
    this.currentTts?.close();
  }

  startTurn(userText) {
    this.turnRunning = true;
    const abortToken = { aborted: false };
    this.currentTurnAbort = abortToken;
    void this.runTurn(userText, abortToken).finally(() => {
      this.turnRunning = false;
      const pending = this.pendingUserText;
      this.pendingUserText = null;
      if (pending && this.ws.readyState === this.ws.OPEN) this.startTurn(pending);
    });
  }

  async turnFromGreeting(abortToken) {
    this.send({ type: "agent_start" });
    this.send({ type: "agent_text", text: GREETING });
    await this.speakFullText(GREETING, undefined, abortToken);
    if (!abortToken.aborted) {
      this.history.push({ role: "assistant", text: GREETING });
      this.send({ type: "agent_done" });
      this.send({ type: "status", state: "listening" });
    }
  }

  async runTurn(userText, abortToken) {
    this.send({ type: "status", state: "thinking" });
    this.send({ type: "agent_start" });

    // Everything below, including settings/prompt lookup, is inside this
    // try -- runTurn is fired without an await/catch at the call site (so a
    // barge_in can interrupt it), so ANY unhandled throw here silently
    // kills the turn: agent_start already told the client "speaking", and
    // with nothing else ever sent the client hangs on that status forever.
    let fullReply = "";
    try {
      const settings = await getSettings();
      const provider = settings.text_provider || "gemini";
      const model = settings.text_model || "gemini-2.5-flash";
      const systemPrompt = await buildSystemPrompt();

      fullReply = await this.speakStream(
        sentences(provider, model, systemPrompt, this.history, userText),
        settings.voice_model_id,
        abortToken
      );
    } catch (err) {
      console.error("[voice-agent] turn failed:", err);
      if (!abortToken.aborted) {
        const fallback = "Sorry, I'm having trouble right now -- could you try again?";
        this.send({ type: "agent_text", text: fallback });
        await this.speakFullText(fallback, undefined, abortToken).catch((ttsErr) =>
          console.error("[voice-agent] fallback tts also failed:", ttsErr)
        );
        fullReply = fallback;
      }
    }

    if (!abortToken.aborted) {
      this.history.push({ role: "user", text: userText });
      if (fullReply) this.history.push({ role: "assistant", text: fullReply });
      this.history = this.history.slice(-24);
      this.send({ type: "agent_done" });
      this.send({ type: "status", state: "listening" });
    }
  }

  /** Drives a full streaming turn on ONE Fish Audio connection, matching
   * the reference repo's app/tts.py::speak exactly -- this is the piece
   * that was wrong before (2026-08-21 bug): the previous port opened and
   * closed a brand-new Fish websocket PER CLAUSE instead of per turn,
   * which meant a multi-clause reply made several rapid-fire connections
   * to a free-tier account instead of one, and any clause after the
   * first was liable to hang/fail. Text is pumped into the stream and
   * audio is read out of it CONCURRENTLY (two tasks racing, not
   * sequential) so playback starts on the first clause while the LLM is
   * still writing later ones. `stop()` is sent exactly once, after the
   * last clause, not per clause. Returns the full text actually spoken. */
  async speakStream(clauseIterable, voiceModelId, abortToken) {
    const tts = new FishTtsStream({ voiceModelId });
    this.currentTts = tts;
    let fullReply = "";

    const pumpText = async () => {
      try {
        await tts.open();
        for await (const clause of clauseIterable) {
          if (abortToken.aborted) break;
          fullReply += clause;
          this.send({ type: "agent_text", text: clause });
          await tts.sendText(clause);
          await tts.flush();
        }
      } finally {
        await tts.stop().catch(() => {});
      }
    };

    const pumpPromise = pumpText();

    try {
      for await (const audio of tts.audioFrames()) {
        if (abortToken.aborted) break;
        this.sendAudio(Buffer.from(audio));
      }
    } catch (err) {
      console.error("[voice-agent] tts audio read failed:", err);
    } finally {
      await pumpPromise.catch((err) => console.error("[voice-agent] tts text pump failed:", err));
      tts.close();
      if (this.currentTts === tts) this.currentTts = null;
    }

    return fullReply;
  }

  /** Speaks one fixed string (the greeting, or a fallback message) on its
   * own single Fish connection -- same one-connection contract as
   * speakStream, just without a concurrent producer since there's only
   * ever one clause. */
  async speakFullText(text, voiceModelId, abortToken) {
    const tts = new FishTtsStream({ voiceModelId });
    this.currentTts = tts;
    try {
      await tts.open();
      if (!abortToken.aborted) {
        await tts.sendText(text);
        await tts.flush();
      }
      await tts.stop();
      for await (const audio of tts.audioFrames()) {
        if (abortToken.aborted) break;
        this.sendAudio(Buffer.from(audio));
      }
    } catch (err) {
      console.error("[voice-agent] tts failed:", err);
    } finally {
      tts.close();
      if (this.currentTts === tts) this.currentTts = null;
    }
  }

  onClose() {
    clearTimeout(this.watchdog);
    const durationSeconds = (Date.now() - this.startedAt) / 1000;
    recordSessionEnd(this.sessionId, durationSeconds, this.endReason).catch((err) =>
      console.error("[voice-agent] failed to record session end:", err)
    );

    // Detached background lead extraction - never blocks or delays socket close
    extractAndSaveLead({
      sessionId: this.sessionId,
      userId: this.userId,
      history: this.history,
    }).catch((err) =>
      console.error("[voice-agent] failed to extract lead:", err)
    );
  }
}
