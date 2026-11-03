"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "idle" | "connecting" | "active" | "ended";
type CallStatus = "" | "listening" | "thinking" | "speaking" | "muted";

type LogEntry = { id: number; role: "system" | "caller" | "agent"; text: string };

type TokenResponse = {
  token: string;
  wsUrl: string;
  sttTokenUrl: string;
  sampleRate: number;
  maxSeconds: number;
};

const STT_RATE = 16000;
const BLOCK_MS = 50;
const PREROLL_BLOCKS = 6; // 300ms kept before speech starts
const HANGOVER_BLOCKS = 22; // ~1.1s trailing audio so AssemblyAI ends the turn
const SPEECH_ONSET_BLOCKS = 2;
const BARGE_ONSET_BLOCKS = 5; // stricter while the agent is talking
const BASE_THRESHOLD = 0.012;
const JITTER_BUFFER = 0.12; // seconds of audio queued before playback
const BAR_COUNT = 18;

/** Owns every mutable piece of a live call (sockets, audio graph, gating
 * state) outside React state -- gating runs every ~50ms and re-rendering
 * on each block would be wasteful. Ported from the reference repo's
 * static/app.js, ~1:1 on the gating/playback math, ~1:1 on the message
 * shapes documented in that repo's ARCHITECTURE.md, ported to a class so
 * callback closures never go stale across renders. Login/quota/business-info
 * gating happens server-side before a token is issued (see
 * /api/voice-agent/token), so nothing about accounts lives here. */
class VoiceCallEngine {
  ui: {
    setPhase: (p: Phase) => void;
    setStatus: (s: CallStatus) => void;
    appendLog: (role: LogEntry["role"], text: string) => void;
    setElapsedLabel: (label: string) => void;
    setError: (message: string) => void;
  };
  barRefs: (HTMLSpanElement | null)[];
  orbRef: { current: HTMLDivElement | null };

  micStream: MediaStream | null = null;
  captureCtx: AudioContext | null = null;
  workletNode: AudioWorkletNode | null = null;
  micAnalyser: AnalyserNode | null = null;
  micFreqData: Uint8Array | null = null;

  playCtx: AudioContext | null = null;
  playGain: GainNode | null = null;
  playAnalyser: AnalyserNode | null = null;
  playFreqData: Uint8Array | null = null;
  nextPlayTime = 0;
  scheduled: AudioBufferSourceNode[] = [];

  sttSocket: WebSocket | null = null;
  agentSocket: WebSocket | null = null;

  preroll: ArrayBuffer[] = [];
  voiced = 0;
  silence = 0;
  streaming = false;
  sentBlocks = 0;
  noiseFloor = 0.004;
  agentSpeaking = false;
  muted = false;
  active = false;
  finished = false;

  sampleRate = 24000;
  maxSeconds = 300;
  endsAt = 0;

  timerHandle: number | null = null;
  keepAliveHandle: number | null = null;
  visualizerHandle: number | null = null;
  barLevels = new Array(BAR_COUNT).fill(0);
  orbLevel = 0;

  constructor(
    ui: VoiceCallEngine["ui"],
    barRefs: (HTMLSpanElement | null)[],
    orbRef: { current: HTMLDivElement | null }
  ) {
    this.ui = ui;
    this.barRefs = barRefs;
    this.orbRef = orbRef;
  }

  // --- lifecycle -----------------------------------------------------

  async start() {
    this.ui.setPhase("connecting");
    this.ui.setError("");
    this.ui.appendLog("system", "Requesting a session...");

    const res = await fetch("/api/voice-agent/token", { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string };
    if (!res.ok) {
      const messages: Record<string, string> = {
        business_info_required: "Save your business details above first, then try again.",
        quota_exceeded: "You've used today's free calls. Try again tomorrow.",
        not_configured: "The voice agent isn't configured yet.",
      };
      throw new Error(messages[data.error || ""] || "Could not start the call.");
    }

    this.sampleRate = data.sampleRate;
    this.maxSeconds = data.maxSeconds;
    this.active = true;
    this.finished = false;
    this.sentBlocks = 0;

    this.ensurePlayback();
    if (this.playCtx!.state === "suspended") await this.playCtx!.resume();

    await this.startCapture();

    const sttTokenRes = await fetch(data.sttTokenUrl, {
      headers: { Authorization: `Bearer ${data.token}` },
    });
    if (!sttTokenRes.ok) throw new Error("Could not reach speech recognition.");
    const { wsUrl: sttWsUrl } = await sttTokenRes.json();

    await Promise.all([this.openSttSocket(sttWsUrl), this.openAgentSocket(data.wsUrl)]);

    this.startTimer();
    this.startVisualizer();
    this.ui.setPhase("active");
    this.ui.setStatus("listening");
    this.send(this.agentSocket, { type: "start" });
  }

  end(message?: string) {
    if (!this.active) return;
    this.active = false;

    this.send(this.agentSocket, {
      type: "stt_usage",
      seconds: (this.sentBlocks * BLOCK_MS) / 1000,
    });
    this.send(this.agentSocket, { type: "end" });

    if (this.timerHandle) window.clearInterval(this.timerHandle);
    if (this.keepAliveHandle) window.clearInterval(this.keepAliveHandle);
    this.stopVisualizer();
    this.stopPlayback();

    if (this.sttSocket?.readyState === WebSocket.OPEN) {
      try {
        this.sttSocket.send(JSON.stringify({ type: "Terminate" }));
      } catch {
        /* already closing */
      }
    }
    [this.sttSocket, this.agentSocket].forEach((socket) => {
      try {
        socket?.close();
      } catch {
        /* already closed */
      }
    });
    this.sttSocket = null;
    this.agentSocket = null;

    try {
      this.workletNode?.disconnect();
    } catch {
      /* noop */
    }
    try {
      this.captureCtx?.close();
    } catch {
      /* noop */
    }
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.workletNode = null;
    this.captureCtx = null;
    this.micStream = null;
    this.micAnalyser = null;
    this.preroll = [];
    this.streaming = false;
    this.muted = false;

    this.ui.setPhase("ended");
    this.ui.setStatus("");
    if (message) this.ui.appendLog("system", message);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) {
      this.streaming = false;
      this.preroll = [];
      this.ui.setStatus("muted");
    } else {
      this.ui.setStatus("listening");
    }
  }

  // --- playback --------------------------------------------------------

  ensurePlayback() {
    if (this.playCtx) return;
    this.playCtx = new AudioContext();
    this.playGain = this.playCtx.createGain();
    this.playGain.connect(this.playCtx.destination);

    this.playAnalyser = this.playCtx.createAnalyser();
    this.playAnalyser.fftSize = 256;
    this.playAnalyser.smoothingTimeConstant = 0.6;
    this.playFreqData = new Uint8Array(this.playAnalyser.frequencyBinCount);
    this.playGain.connect(this.playAnalyser);
    this.nextPlayTime = 0;
  }

  enqueueAudio(arrayBuffer: ArrayBuffer) {
    this.ensurePlayback();
    const ctx = this.playCtx!;
    const pcm = new Int16Array(arrayBuffer);
    if (!pcm.length) return;

    const buffer = ctx.createBuffer(1, pcm.length, this.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 32768;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.playGain!);

    const earliest = ctx.currentTime + JITTER_BUFFER;
    const startAt = Math.max(earliest, this.nextPlayTime);
    source.start(startAt);
    this.nextPlayTime = startAt + buffer.duration;
    this.agentSpeaking = true;

    this.scheduled.push(source);
    source.onended = () => {
      this.scheduled = this.scheduled.filter((s) => s !== source);
      if (this.nextPlayTime <= ctx.currentTime + 0.05) this.agentSpeaking = false;
    };
  }

  stopPlayback() {
    this.scheduled.forEach((source) => {
      try {
        source.stop();
      } catch {
        /* already finished */
      }
    });
    this.scheduled = [];
    this.agentSpeaking = false;
    if (this.playCtx) this.nextPlayTime = this.playCtx.currentTime;
  }

  // --- visualizer --------------------------------------------------------

  bandLevel(freqData: Uint8Array, band: number, bands: number) {
    const usable = Math.max(2, Math.floor(freqData.length * 0.65));
    const start = Math.max(1, Math.floor((band / bands) * usable));
    const end = Math.max(start + 1, Math.floor(((band + 1) / bands) * usable));
    let sum = 0;
    for (let i = start; i < end; i++) sum += freqData[i];
    return sum / (end - start) / 255;
  }

  visualizerFrame = () => {
    const now = performance.now();
    let source: Uint8Array | null = null;
    if (this.agentSpeaking && this.playAnalyser && this.playFreqData) {
      this.playAnalyser.getByteFrequencyData(this.playFreqData as Uint8Array<ArrayBuffer>);
      source = this.playFreqData;
    } else if (this.streaming && this.micAnalyser && this.micFreqData) {
      this.micAnalyser.getByteFrequencyData(this.micFreqData as Uint8Array<ArrayBuffer>);
      source = this.micFreqData;
    }

    for (let i = 0; i < BAR_COUNT; i++) {
      let target: number;
      if (source) {
        target = Math.sqrt(this.bandLevel(source, i, BAR_COUNT));
      } else if (this.active) {
        target = 0.05 + 0.035 * Math.sin(now / 900 + i * 0.9);
      } else {
        target = 0;
      }
      const rate = target > this.barLevels[i] ? 0.55 : 0.14;
      this.barLevels[i] += (target - this.barLevels[i]) * rate;
      const el = this.barRefs[i];
      if (el) el.style.height = (8 + this.barLevels[i] * 44).toFixed(1) + "px";
    }

    const avg = this.barLevels.reduce((a, b) => a + b, 0) / BAR_COUNT;
    this.orbLevel += (avg - this.orbLevel) * 0.18;
    if (this.orbRef.current) this.orbRef.current.style.setProperty("--level", this.orbLevel.toFixed(3));

    this.visualizerHandle = requestAnimationFrame(this.visualizerFrame);
  };

  startVisualizer() {
    if (this.visualizerHandle) return;
    this.visualizerHandle = requestAnimationFrame(this.visualizerFrame);
  }

  stopVisualizer() {
    if (this.visualizerHandle) cancelAnimationFrame(this.visualizerHandle);
    this.visualizerHandle = null;
    this.barLevels.fill(0);
    this.orbLevel = 0;
    this.barRefs.forEach((bar) => bar && (bar.style.height = "8px"));
    if (this.orbRef.current) this.orbRef.current.style.setProperty("--level", "0");
  }

  startTimer() {
    this.endsAt = Date.now() + this.maxSeconds * 1000;
    const tick = () => {
      const left = Math.max(0, Math.round((this.endsAt - Date.now()) / 1000));
      const m = String(Math.floor(left / 60)).padStart(2, "0");
      const s = String(left % 60).padStart(2, "0");
      this.ui.setElapsedLabel(`${m}:${s}`);
    };
    tick();
    this.timerHandle = window.setInterval(tick, 500);
  }

  // --- microphone capture and gating --------------------------------------

  async startCapture() {
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    this.captureCtx = new AudioContext({ sampleRate: STT_RATE });
    await this.captureCtx.audioWorklet.addModule("/pcm-worklet.js");

    const source = this.captureCtx.createMediaStreamSource(this.micStream);
    this.workletNode = new AudioWorkletNode(this.captureCtx, "pcm-worklet");
    this.workletNode.port.onmessage = (event) => this.onAudioBlock(event.data);
    source.connect(this.workletNode);

    const silent = this.captureCtx.createGain();
    silent.gain.value = 0;
    this.workletNode.connect(silent).connect(this.captureCtx.destination);

    this.micAnalyser = this.captureCtx.createAnalyser();
    this.micAnalyser.fftSize = 64;
    this.micAnalyser.smoothingTimeConstant = 0.5;
    this.micFreqData = new Uint8Array(this.micAnalyser.frequencyBinCount);
    source.connect(this.micAnalyser);
  }

  onAudioBlock({ pcm, rms }: { pcm: ArrayBuffer; rms: number }) {
    if (!this.active || this.muted) return;

    if (!this.streaming && !this.agentSpeaking) {
      this.noiseFloor = this.noiseFloor * 0.97 + rms * 0.03;
    }

    const threshold = Math.max(BASE_THRESHOLD, this.noiseFloor * 3.5) * (this.agentSpeaking ? 2.6 : 1);
    const onset = this.agentSpeaking ? BARGE_ONSET_BLOCKS : SPEECH_ONSET_BLOCKS;
    const loud = rms > threshold;

    if (loud) {
      this.voiced++;
      this.silence = 0;
    } else {
      this.silence++;
      if (this.silence > 3) this.voiced = 0;
    }

    if (!this.streaming) {
      this.preroll.push(pcm);
      if (this.preroll.length > PREROLL_BLOCKS) this.preroll.shift();

      if (this.voiced >= onset) {
        if (this.agentSpeaking) this.bargeIn();
        this.streaming = true;
        this.preroll.forEach((p) => this.sendAudio(p));
        this.preroll = [];
        this.ui.setStatus("listening");
      }
      return;
    }

    this.sendAudio(pcm);

    if (this.silence >= HANGOVER_BLOCKS) {
      this.streaming = false;
      this.voiced = 0;
      this.preroll = [];
      this.send(this.sttSocket, { type: "ForceEndpoint" });
    }
  }

  sendAudio(buffer: ArrayBuffer) {
    if (this.sttSocket?.readyState !== WebSocket.OPEN) return;
    this.sttSocket.send(buffer);
    this.sentBlocks++;
  }

  bargeIn() {
    this.stopPlayback();
    this.send(this.agentSocket, { type: "barge_in" });
    this.ui.setStatus("listening");
    this.ui.appendLog("system", "Barge-in -- agent audio stopped.");
  }

  // --- sockets --------------------------------------------------------------

  send(socket: WebSocket | null, payload: unknown) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  }

  openSttSocket(url: string) {
    return new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.binaryType = "arraybuffer";
      const failed = window.setTimeout(() => reject(new Error("Speech recognition timed out.")), 10000);

      socket.onopen = () => {
        window.clearTimeout(failed);
        this.sttSocket = socket;
        this.keepAliveHandle = window.setInterval(() => {
          if (!this.streaming) this.send(socket, { type: "KeepAlive" });
        }, 10000);
        resolve();
      };
      socket.onmessage = (event) => {
        let data: { type?: string; transcript?: string; end_of_turn?: boolean; utterance?: string };
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        if (data.type === "Turn") this.onTurn(data);
      };
      socket.onerror = () => {
        window.clearTimeout(failed);
        reject(new Error("Speech recognition failed to connect."));
      };
      socket.onclose = () => {
        if (this.active && !this.finished) this.ui.setError("Speech recognition disconnected.");
      };
    });
  }

  onTurn(data: { transcript?: string; end_of_turn?: boolean; utterance?: string }) {
    const text = (data.transcript || "").trim();
    if (!text) return;
    if (!data.end_of_turn) return;

    const finalText = (data.utterance || text).trim();
    if (!finalText) return;

    this.ui.appendLog("caller", finalText);
    this.ui.setStatus("thinking");
    this.send(this.agentSocket, { type: "user_turn", text: finalText });
  }

  openAgentSocket(url: string) {
    return new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.binaryType = "arraybuffer";
      const failed = window.setTimeout(() => reject(new Error("Could not reach the voice agent.")), 10000);

      socket.onopen = () => {
        window.clearTimeout(failed);
        this.agentSocket = socket;
        resolve();
      };
      socket.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          this.enqueueAudio(event.data);
        } else {
          let data: { type?: string; text?: string; state?: string; message?: string };
          try {
            data = JSON.parse(event.data);
          } catch {
            return;
          }
          this.onAgentMessage(data);
        }
      };
      socket.onerror = () => {
        window.clearTimeout(failed);
        reject(new Error("Could not reach the voice agent."));
      };
      socket.onclose = () => {
        if (this.active && !this.finished) this.end("Call ended.");
      };
    });
  }

  onAgentMessage(data: { type?: string; text?: string; state?: string; message?: string }) {
    switch (data.type) {
      case "agent_start":
        this.ui.setStatus("speaking");
        break;
      case "agent_text":
        if (data.text) this.ui.appendLog("agent", data.text);
        break;
      case "agent_done":
        this.ui.setStatus("listening");
        break;
      case "status":
        if (data.state === "listening") this.ui.setStatus("listening");
        if (data.state === "thinking") this.ui.setStatus("thinking");
        break;
      case "ended":
        this.finished = true;
        this.end(data.message || "Call ended.");
        break;
    }
  }
}

export default function VoiceAgentCall() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<CallStatus>("");
  const [elapsedLabel, setElapsedLabel] = useState("00:00");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showFullLog, setShowFullLog] = useState(false);
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);

  const logIdRef = useRef(0);
  const engineRef = useRef<VoiceCallEngine | null>(null);
  const barRefs = useRef<(HTMLSpanElement | null)[]>(Array.from({ length: BAR_COUNT }, () => null));
  const orbRef = useRef<HTMLDivElement | null>(null);

  // Newest message first (owner's request) -- so the latest line of the
  // conversation is always visible at the top of the panel without
  // scrolling down to find it.
  const appendLog = useCallback((role: LogEntry["role"], text: string) => {
    logIdRef.current += 1;
    setLogs((current) => [{ id: logIdRef.current, role, text }, ...current].slice(0, 10));
  }, []);

  const ensureEngine = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = new VoiceCallEngine(
        { setPhase, setStatus, appendLog, setElapsedLabel, setError },
        barRefs.current,
        orbRef
      );
    }
    return engineRef.current;
  }, [appendLog]);

  useEffect(() => {
    return () => {
      engineRef.current?.end();
    };
  }, []);

  async function handleStart() {
    if (!navigator.mediaDevices || !window.AudioWorklet) {
      setError("This browser can't run the voice agent. Try Chrome, Edge, or Safari.");
      return;
    }
    setLogs([]);
    setShowFullLog(false);
    setError("");
    const engine = ensureEngine();
    try {
      await engine.start();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not start the call.";
      setError(message);
      setPhase("idle");
    }
  }

  function handleEnd() {
    engineRef.current?.end();
  }

  function handleMuteToggle() {
    engineRef.current?.toggleMute();
    setMuted((m) => !m);
  }

  const statusLabel =
    phase === "connecting"
      ? "Connecting"
      : status === "listening"
        ? "Listening"
        : status === "thinking"
          ? "Thinking"
          : status === "speaking"
            ? "Agent speaking"
            : status === "muted"
              ? "Muted"
              : phase === "ended"
                ? "Ended"
                : "Ready";

  const isLive = status === "listening" || status === "speaking" || status === "thinking";

  return (
    <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-[2rem] border border-line bg-paper p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-ink-soft">Voice agent</p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-ink">Receptionist call</h2>
          </div>
          <div
            className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] ${
              isLive ? "border-ink bg-ink text-paper" : "border-line text-ink-soft"
            }`}
          >
            {statusLabel}
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : null}

        <div className="mt-8 grid gap-6 lg:grid-cols-[200px_1fr] lg:items-center">
          <div
            ref={orbRef}
            className="relative mx-auto flex h-[200px] w-[200px] items-center justify-center rounded-full border border-line"
            style={{ "--level": 0 } as React.CSSProperties}
          >
            <div
              className={`absolute inset-6 rounded-full border border-line transition-transform duration-300 ${
                status === "speaking" ? "scale-110" : status === "listening" ? "scale-105" : "scale-100"
              }`}
            />
            <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-ink">
              <div className={`h-3.5 w-3.5 rounded-full bg-paper ${isLive ? "animate-pulse" : ""}`} />
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-2xl border border-line p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-ink-soft">Session state</p>
                  <p className="mt-1 text-lg font-semibold text-ink">{statusLabel}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-ink-soft">Time left</p>
                  <p className="mt-1 font-display text-2xl tabular-nums text-ink">{elapsedLabel}</p>
                </div>
              </div>

              <div className="mt-5 flex h-[60px] items-end gap-1.5 overflow-hidden" aria-hidden="true">
                {Array.from({ length: BAR_COUNT }).map((_, index) => (
                  <span
                    key={index}
                    ref={(el) => {
                      barRefs.current[index] = el;
                    }}
                    className="w-2 rounded-full bg-ink/70"
                    style={{ height: "8px" }}
                  />
                ))}
              </div>

              <p className="mt-4 text-sm leading-6 text-ink-soft">
                A real live call, five minutes max: your mic streams to speech recognition, a live model replies,
                and its voice streams back. It only listens while you&rsquo;re actually talking.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {phase === "idle" || phase === "ended" ? (
                <button
                  type="button"
                  onClick={handleStart}
                  className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-paper transition hover:bg-ink/85"
                >
                  Start call
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleMuteToggle}
                    className="rounded-full border border-line px-6 py-3 text-sm font-semibold text-ink transition hover:border-ink"
                  >
                    {muted ? "Unmute" : "Mute"}
                  </button>
                  <button
                    type="button"
                    onClick={handleEnd}
                    className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-paper transition hover:bg-ink/85"
                  >
                    End call
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <aside className="rounded-[2rem] border border-line bg-paper p-6 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-ink-soft">On the line</p>
            <h3 className="mt-2 font-display text-2xl font-semibold text-ink">What&rsquo;s being said</h3>
          </div>
          {logs.length > 0 && (
            <button
              type="button"
              onClick={() => setShowFullLog((v) => !v)}
              className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft transition hover:border-ink hover:text-ink"
            >
              {showFullLog ? "Collapse" : "View full conversation"}
            </button>
          )}
        </div>

        {showFullLog ? (
          <div className="mt-6 max-h-[420px] space-y-3 overflow-y-auto">
            {logs.map((entry) => (
              <div
                key={entry.id}
                className={`rounded-2xl border p-4 text-sm leading-6 text-ink ${
                  entry.role === "system" ? "border-dashed border-line bg-paper-soft text-ink-soft" : "border-line"
                }`}
              >
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-soft">
                  {entry.role === "agent" ? "Agent" : entry.role === "caller" ? "You" : "System"}
                </p>
                <p>{entry.text}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6">
            {logs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line bg-paper-soft p-5 text-sm text-ink-soft">
                Start the call and what&rsquo;s said will appear here, live.
              </div>
            ) : (
              <div
                key={logs[0].id}
                className={`animate-[fadeIn_0.25s_ease-out] rounded-2xl border p-5 text-sm leading-6 text-ink ${
                  logs[0].role === "system" ? "border-dashed border-line bg-paper-soft text-ink-soft" : "border-line"
                }`}
              >
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-soft">
                  {logs[0].role === "agent" ? "Agent" : logs[0].role === "caller" ? "You" : "System"}
                </p>
                <p>{logs[0].text}</p>
              </div>
            )}
          </div>
        )}
      </aside>
    </section>
  );
}
