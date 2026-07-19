/**
 * OBS WebSocket (v5 protocol) client.
 *
 * Connects directly from the browser to a local OBS Studio instance running
 * the built-in obs-websocket server (OBS 28+). No server-side component
 * needed — just a plain WebSocket + the v5 Identify/auth handshake.
 *
 * Protocol reference: https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md
 *
 * Design mirrors the other connectors in this app (Twitch/Kick/Spotify):
 * a framework-agnostic class extending Emitter, with a thin React hook
 * (`useObs`) syncing its state to component state.
 */
import { Emitter } from "./Emitter";

export type ObsConnStatus = "idle" | "connecting" | "connected" | "error";

export interface ObsCanvasInfo {
  canvasName: string;
  canvasUuid: string;
}

export interface ObsSceneItem {
  sceneItemId: number;
  sourceName: string;
  inputKind?: string;
  sourceType?: string;
  sceneItemEnabled: boolean;
  isGroup: boolean;
}

export interface ObsAudioInput {
  inputName: string;
  inputKind: string;
  muted: boolean;
  /** Linear amplitude multiplier (0 = silent, 1 = 0 dB). */
  volumeMul: number;
  /** Volume in dB as reported by OBS (0 dB is "full"/unity). */
  volumeDb: number;
}

export interface ObsStats {
  cpu: number;
  fps: number;
  renderLagMs: number;
  droppedFrames: number;
  totalFrames: number;
}

export interface ObsState {
  obsVersion: string;
  canvases: ObsCanvasInfo[];
  verticalCanvasUuid: string | null;
  verticalScenes: string[];
  verticalCurrentScene: string;
  verticalPreviewScene: string;
  verticalSceneItems: ObsSceneItem[];
  scenes: string[];
  currentScene: string;
  previewScene: string;
  studioModeEnabled: boolean;
  sceneItems: ObsSceneItem[];
  audioInputs: ObsAudioInput[];
  streaming: { active: boolean; timecode: string; startedAt: number | null };
  recording: { active: boolean; paused: boolean; timecode: string; startedAt: number | null };
  virtualCam: boolean;
  replayBuffer: boolean;
  transitionDuration?: number;
  stats: ObsStats | null;
}

export const EMPTY_OBS_STATE: ObsState = {
  obsVersion: "",
  canvases: [],
  verticalCanvasUuid: null,
  verticalScenes: [],
  verticalCurrentScene: "",
  verticalPreviewScene: "",
  verticalSceneItems: [],
  scenes: [],
  currentScene: "",
  previewScene: "",
  studioModeEnabled: false,
  sceneItems: [],
  audioInputs: [],
  streaming: { active: false, timecode: "00:00:00", startedAt: null },
  recording: { active: false, paused: false, timecode: "00:00:00", startedAt: null },
  virtualCam: false,
  replayBuffer: false,
  transitionDuration: 300,
  stats: null,
};

const POLL_MS = 2000;

export function formatTimecodeFromMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "00:00:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function getStreamLengthTimecode(state: ObsState): string {
  if (state.streaming.active) {
    if (state.streaming.startedAt !== null && state.streaming.startedAt > 0) {
      const elapsed = Math.max(0, Date.now() - state.streaming.startedAt);
      if (elapsed >= 1000) return formatTimecodeFromMs(elapsed);
    }
    if (state.streaming.timecode && state.streaming.timecode !== "00:00:00") {
      return state.streaming.timecode.split(".")[0].trim();
    }
  }
  if (state.recording.active) {
    if (state.recording.startedAt !== null && state.recording.startedAt > 0) {
      const elapsed = Math.max(0, Date.now() - state.recording.startedAt);
      if (elapsed >= 1000) return formatTimecodeFromMs(elapsed);
    }
    if (state.recording.timecode && state.recording.timecode !== "00:00:00") {
      return state.recording.timecode.split(".")[0].trim();
    }
  }
  return "00:00:00";
}

function parseTimecodeToMs(timecode: string): number {
  const raw = (timecode.split(".")[0] || timecode).trim();
  const parts = raw.split(":").map(Number);
  if (!parts.length || parts.some((p) => !Number.isFinite(p) || p < 0)) return 0;
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  if (parts.length === 1) return parts[0] * 1000;
  return 0;
}
/**
 * EventSubscription::All per obs-websocket v5.
 * General(1) + Config(2) + Scenes(4) + Inputs(8) + Transitions(16) +
 * Filters(32) + Outputs(64) + SceneItems(128) + MediaInputs(256) +
 * Vendors(512) + Ui(1024) = 2047.
 *
 * Previously this was 1023, which excludes the "Ui" category — and
 * StudioModeStateChanged is a Ui event. That meant OBS-side studio mode
 * changes (and our own toggle, before the optimistic update below) never
 * synced back, which is why the toggle looked one-directional.
 */
const EVENT_SUBSCRIPTIONS = 2047;

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function sha256Base64(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

async function buildAuthString(password: string, salt: string, challenge: string): Promise<string> {
  const secret = await sha256Base64(password + salt);
  return sha256Base64(secret + challenge);
}

interface PendingRequest {
  resolve: (data: any) => void;
  reject: (err: Error) => void;
}

export class ObsClient extends Emitter {
  private ws: WebSocket | null = null;
  private closed = true;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private retryDelay = 1000;
  private pending = new Map<string, PendingRequest>();

  private host = "127.0.0.1";
  private port = 4455;
  private password = "";

  private status: ObsConnStatus = "idle";
  private state: ObsState = { ...EMPTY_OBS_STATE };

  private streamStartedAt: number | null = null;
  private recordStartedAt: number | null = null;
  private streamTracksFactor = 1;
  private recordTracksFactor = 1;
  private lastStreamObsDuration: number | null = null;
  private lastStreamWallTime: number | null = null;
  private lastRecordObsDuration: number | null = null;
  private lastRecordWallTime: number | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  connect(host: string, port: number, password: string): void {
    this.closed = false;
    this.host = host.trim() || "127.0.0.1";
    this.port = port || 4455;
    this.password = password;
    this.retryDelay = 1000;
    this.doConnect();
  }

  disconnect(): void {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.pollTimer = null;
    this.tickTimer = null;
    this.streamStartedAt = null;
    this.recordStartedAt = null;
    this.lastStreamObsDuration = null;
    this.lastStreamWallTime = null;
    this.lastRecordObsDuration = null;
    this.lastRecordWallTime = null;
    this.streamTracksFactor = 1;
    this.recordTracksFactor = 1;
    this.pending.forEach((p) => p.reject(new Error("Disconnected")));
    this.pending.clear();
    this.ws?.close();
    this.ws = null;
    this.state = { ...EMPTY_OBS_STATE };
    this.setStatus("idle");
  }

  getState(): ObsState {
    return this.state;
  }

  getStatus(): ObsConnStatus {
    return this.status;
  }

  onStatus(cb: (status: ObsConnStatus, error?: string) => void): () => void {
    return this.on<{ status: ObsConnStatus; error?: string }>("status", (p) => cb(p.status, p.error));
  }

  onState(cb: (state: ObsState) => void): () => void {
    return this.on<ObsState>("state", cb);
  }

  /* ---------------- actions ---------------- */

  async setCurrentScene(sceneName: string, canvasUuid?: string | null): Promise<void> {
    if (canvasUuid && canvasUuid === this.state.verticalCanvasUuid) {
      await this.call("SetCurrentProgramScene", { sceneName, canvasUuid }).catch(() => {});
      for (const vendor of ["aitum-vertical-canvas", "vertical-canvas", "obs-vertical-canvas"]) {
        await this.call("CallVendorRequest", {
          vendorName: vendor,
          requestType: "switch_scene",
          requestData: { scene: sceneName },
        }).catch(() => {});
      }
      this.state.verticalCurrentScene = sceneName;
      this.emitState();
      void this.refreshSceneItems(sceneName, true);
    } else {
      await this.call("SetCurrentProgramScene", { sceneName }).catch(() => {});
      this.state.currentScene = sceneName;
      this.emitState();
      void this.refreshSceneItems(sceneName, false);
    }
    void this.refreshScenes();
  }

  async setPreviewScene(sceneName: string, canvasUuid?: string | null): Promise<void> {
    if (canvasUuid && canvasUuid === this.state.verticalCanvasUuid) {
      await this.call("SetCurrentPreviewScene", { sceneName, canvasUuid }).catch(() => {});
      this.state.verticalPreviewScene = sceneName;
      this.emitState();
    } else {
      await this.call("SetCurrentPreviewScene", { sceneName }).catch(() => {});
      this.state.previewScene = sceneName;
      this.emitState();
    }
    void this.refreshScenes();
  }

  async triggerStudioTransition(): Promise<void> {
    await this.call("TriggerStudioModeTransition").catch(() => {});
    if (this.state.verticalCanvasUuid && this.state.verticalPreviewScene && this.state.verticalPreviewScene !== this.state.verticalCurrentScene) {
      const targetVScene = this.state.verticalPreviewScene;
      await this.call("SetCurrentProgramScene", { sceneName: targetVScene, canvasUuid: this.state.verticalCanvasUuid }).catch(() => {});
      for (const vendor of ["aitum-vertical-canvas", "vertical-canvas", "obs-vertical-canvas"]) {
        await this.call("CallVendorRequest", {
          vendorName: vendor,
          requestType: "switch_scene",
          requestData: { scene: targetVScene },
        }).catch(() => {});
      }
      this.state.verticalCurrentScene = targetVScene;
      this.emitState();
      void this.refreshSceneItems(targetVScene, true);
    }
    void this.refreshScenes();
  }

  async setStudioMode(enabled: boolean): Promise<void> {
    await this.call("SetStudioModeEnabled", { studioModeEnabled: enabled });
    // Optimistic update — matches every other action here. Without this,
    // the toggle only ever appeared to work in one direction because it
    // relied entirely on the StudioModeStateChanged event.
    this.state.studioModeEnabled = enabled;
    this.emitState();
  }

  async toggleSceneItem(sceneItemId: number, enabled: boolean, sceneName?: string, canvasUuid?: string | null): Promise<void> {
    const targetScene = sceneName ?? (canvasUuid === this.state.verticalCanvasUuid ? this.state.verticalCurrentScene : this.state.currentScene);
    const reqData: any = {
      sceneName: targetScene,
      sceneItemId,
      sceneItemEnabled: enabled,
    };
    if (canvasUuid) reqData.canvasUuid = canvasUuid;
    await this.call("SetSceneItemEnabled", reqData);
    if (canvasUuid && canvasUuid === this.state.verticalCanvasUuid) {
      const item = this.state.verticalSceneItems.find((i) => i.sceneItemId === sceneItemId);
      if (item) item.sceneItemEnabled = enabled;
      this.emitState();
    } else if (targetScene === this.state.currentScene) {
      const item = this.state.sceneItems.find((i) => i.sceneItemId === sceneItemId);
      if (item) item.sceneItemEnabled = enabled;
      this.emitState();
    }
  }

  async setMute(inputName: string, muted: boolean): Promise<void> {
    await this.call("SetInputMute", { inputName, inputMuted: muted });
    const input = this.state.audioInputs.find((i) => i.inputName === inputName);
    if (input) input.muted = muted;
    this.emitState();
  }

  async setVolume(inputName: string, volumeDb: number): Promise<void> {
    // Drive OBS with dB so the UI's 0 dB maps to OBS's 100% (unity).
    await this.call("SetInputVolume", { inputName, inputVolumeDb: volumeDb });
    const input = this.state.audioInputs.find((i) => i.inputName === inputName);
    if (input) {
      input.volumeDb = volumeDb;
      // Approximate linear mul for local display consistency.
      input.volumeMul = volumeDb <= -100 ? 0 : Math.pow(10, volumeDb / 20);
    }
    this.emitState();
  }

  async startStream(): Promise<void> {
    await this.call("StartStream");
  }
  async stopStream(): Promise<void> {
    await this.call("StopStream");
  }
  async startRecord(): Promise<void> {
    await this.call("StartRecord");
  }
  async stopRecord(): Promise<void> {
    await this.call("StopRecord");
  }
  async pauseRecord(): Promise<void> {
    await this.call("PauseRecord");
  }
  async resumeRecord(): Promise<void> {
    await this.call("ResumeRecord");
  }
  async startVirtualCam(): Promise<void> {
    await this.call("StartVirtualCam");
  }
  async stopVirtualCam(): Promise<void> {
    await this.call("StopVirtualCam");
  }
  async startReplayBuffer(): Promise<void> {
    await this.call("StartReplayBuffer");
  }
  async stopReplayBuffer(): Promise<void> {
    await this.call("StopReplayBuffer");
  }
  async saveReplayBuffer(): Promise<void> {
    await this.call("SaveReplayBuffer");
  }

  /* ---------------- internals ---------------- */

  private setStatus(status: ObsConnStatus, error?: string): void {
    this.status = status;
    this.emit("status", { status, error });
  }

  private emitState(): void {
    this.emit<ObsState>("state", { ...this.state });
  }

  private doConnect(): void {
    if (this.closed) return;
    this.setStatus("connecting");
    const ws = new WebSocket(`ws://${this.host}:${this.port}`);
    this.ws = ws;

    ws.onmessage = (ev) => void this.handleMessage(String(ev.data));

    ws.onclose = (event) => {
      this.pending.forEach((p) => p.reject(new Error("Connection closed")));
      this.pending.clear();
      if (this.pollTimer) clearInterval(this.pollTimer);
      if (this.tickTimer) clearInterval(this.tickTimer);
      this.pollTimer = null;
      this.tickTimer = null;
      this.streamStartedAt = null;
      this.recordStartedAt = null;
      this.lastStreamObsDuration = null;
      this.lastStreamWallTime = null;
      this.lastRecordObsDuration = null;
      this.lastRecordWallTime = null;
      this.streamTracksFactor = 1;
      this.recordTracksFactor = 1;

      if (event.code === 4009) {
        // WebSocketCloseCode::AuthenticationFailed
        this.closed = true;
        this.setStatus("error", "Incorrect OBS WebSocket password.");
        return;
      }

      if (this.closed) return;
      this.setStatus(
        "connecting",
        "Waiting for OBS… make sure OBS is running and the WebSocket server is enabled."
      );
      this.retryTimer = setTimeout(() => this.doConnect(), this.retryDelay);
      this.retryDelay = Math.min(this.retryDelay * 2, 15000);
    };

    ws.onerror = () => ws.close();
  }

  private async handleMessage(raw: string): Promise<void> {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.op) {
      case 0: // Hello
        await this.handleHello(msg.d);
        break;
      case 2: // Identified
        this.setStatus("connected");
        this.retryDelay = 1000;
        void this.onIdentified();
        break;
      case 5: // Event
        this.handleEvent(msg.d?.eventType, msg.d?.eventData || {});
        break;
      case 7: // RequestResponse
        this.handleResponse(msg.d);
        break;
      default:
        break;
    }
  }

  private async handleHello(hello: any): Promise<void> {
    const identify: Record<string, unknown> = {
      rpcVersion: hello.rpcVersion,
      eventSubscriptions: EVENT_SUBSCRIPTIONS,
    };
    if (hello.authentication) {
      identify.authentication = await buildAuthString(
        this.password,
        hello.authentication.salt,
        hello.authentication.challenge
      );
    }
    this.ws?.send(JSON.stringify({ op: 1, d: identify }));
  }

  private handleResponse(d: any): void {
    const pending = this.pending.get(d?.requestId);
    if (!pending) return;
    this.pending.delete(d.requestId);
    if (d.requestStatus?.result) {
      pending.resolve(d.responseData || {});
    } else {
      pending.reject(new Error(d.requestStatus?.comment || `${d.requestType} failed`));
    }
  }

  private call<T = any>(requestType: string, requestData?: object): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected to OBS"));
        return;
      }
      const requestId = generateId();
      this.pending.set(requestId, { resolve, reject });
      this.ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
      setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId);
          reject(new Error(`${requestType} timed out`));
        }
      }, 8000);
    });
  }

  private async onIdentified(): Promise<void> {
    try {
      const version = await this.call<{ obsVersion: string }>("GetVersion");
      this.state.obsVersion = version.obsVersion;
    } catch {
      /* non-critical */
    }
    try {
      const transitionRes = await this.call<{ transitionDuration: number }>("GetCurrentSceneTransition");
      if (typeof transitionRes?.transitionDuration === "number") {
        this.state.transitionDuration = transitionRes.transitionDuration;
      }
    } catch {
      /* non-critical */
    }
    await this.refreshScenes();
    await this.refreshSceneItems();
    await this.refreshAudioInputs();
    await this.refreshOutputs();
    await this.refreshStats();
    this.emitState();
    this.startTicker();
    this.startPolling();
  }

  private startTicker(): void {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => {
      let changed = false;
      const now = Date.now();
      if (this.state.streaming.active && this.streamStartedAt !== null) {
        const elapsed = Math.max(0, now - this.streamStartedAt);
        const tc = formatTimecodeFromMs(elapsed);
        if (this.state.streaming.timecode !== tc) {
          this.state.streaming.timecode = tc;
          changed = true;
        }
      }
      if (this.state.recording.active && !this.state.recording.paused && this.recordStartedAt !== null) {
        const elapsed = Math.max(0, now - this.recordStartedAt);
        const tc = formatTimecodeFromMs(elapsed);
        if (this.state.recording.timecode !== tc) {
          this.state.recording.timecode = tc;
          changed = true;
        }
      }
      if (changed) {
        this.emitState();
      }
      void this.refreshScenes();
    }, 1000);
  }

  private async refreshScenes(): Promise<void> {
    try {
      const res = await this.call<{
        scenes: { sceneName: string }[];
        currentProgramSceneName: string;
        currentPreviewSceneName?: string;
      }>("GetSceneList");
      this.state.scenes = (res.scenes || []).map((s) => s.sceneName);
      this.state.currentScene = res.currentProgramSceneName || "";
      this.state.previewScene = res.currentPreviewSceneName || "";
    } catch {
      /* ignore */
    }

    try {
      const canvasRes = await this.call<{ canvases: { canvasName: string; canvasUuid: string }[] }>("GetCanvasList");
      if (canvasRes && Array.isArray(canvasRes.canvases)) {
        this.state.canvases = canvasRes.canvases;
        const vCanvas = canvasRes.canvases.find(
          (c) =>
            c.canvasName.toLowerCase().includes("vertical") ||
            c.canvasName.toLowerCase().includes("aitum") ||
            c.canvasName.toLowerCase().includes("[v]") ||
            (c.canvasUuid && c !== canvasRes.canvases[0] && canvasRes.canvases.length === 2)
        );
        if (vCanvas) {
          this.state.verticalCanvasUuid = vCanvas.canvasUuid;
          const vSceneRes = await this.call<{
            scenes: { sceneName: string }[];
            currentProgramSceneName: string;
            currentPreviewSceneName?: string;
          }>("GetSceneList", { canvasUuid: vCanvas.canvasUuid }).catch(() => null);
          if (vSceneRes) {
            this.state.verticalScenes = (vSceneRes.scenes || []).map((s) => s.sceneName);
            if (vSceneRes.currentProgramSceneName && typeof vSceneRes.currentProgramSceneName === "string" && vSceneRes.currentProgramSceneName.trim() !== "") {
              this.state.verticalCurrentScene = vSceneRes.currentProgramSceneName;
            }
            if (vSceneRes.currentPreviewSceneName && typeof vSceneRes.currentPreviewSceneName === "string" && vSceneRes.currentPreviewSceneName.trim() !== "") {
              this.state.verticalPreviewScene = vSceneRes.currentPreviewSceneName;
            }
          }

          let foundActiveScene = "";
          // 1. Query Aitum Vertical directly via CallVendorRequest to get exact active scene
          for (const vendor of ["aitum-vertical-canvas", "vertical-canvas", "obs-vertical-canvas"]) {
            try {
              let vCurr = await this.call<any>("CallVendorRequest", {
                vendorName: vendor,
                requestType: "current_scene",
              }).catch(() => null);
              if (!vCurr?.scene) {
                vCurr = await this.call<any>("CallVendorRequest", {
                  vendorName: vendor,
                  requestType: "current_scene",
                  requestData: { width: 1080, height: 1920 },
                }).catch(() => null);
              }
              if (vCurr?.scene && typeof vCurr.scene === "string" && vCurr.scene.trim() !== "") {
                foundActiveScene = vCurr.scene.trim();
                break;
              }
            } catch {
              /* try next vendor */
            }
          }

          // 2. If CallVendorRequest returned empty or null, check GetSourceActive for each vertical scene on the canvas UUID!
          if (!foundActiveScene && this.state.verticalScenes.length > 0 && vCanvas.canvasUuid) {
            for (const s of this.state.verticalScenes) {
              try {
                const activeRes = await this.call<{ videoActive: boolean; videoShowing: boolean }>("GetSourceActive", {
                  sourceName: s,
                  canvasUuid: vCanvas.canvasUuid,
                }).catch(() => null);
                if (activeRes && (activeRes.videoActive || activeRes.videoShowing)) {
                  foundActiveScene = s;
                  break;
                }
              } catch {
                /* check next */
              }
            }
          }

          if (foundActiveScene && foundActiveScene !== this.state.verticalCurrentScene) {
            this.state.verticalCurrentScene = foundActiveScene;
            this.emitState();
            void this.refreshSceneItems(foundActiveScene, true);
          } else if (!this.state.verticalCurrentScene && this.state.verticalScenes.length > 0) {
            this.state.verticalCurrentScene = this.state.verticalScenes[0];
          }
          if (!this.state.verticalPreviewScene && this.state.verticalScenes.length > 0) {
            this.state.verticalPreviewScene = this.state.verticalScenes[0];
          }
        } else {
          this.state.verticalCanvasUuid = null;
        }
      }
    } catch {
      this.state.canvases = [];
      this.state.verticalCanvasUuid = null;
    }
  }

  private async refreshSceneItems(sceneName?: string, isVertical = false): Promise<void> {
    if (!isVertical) {
      const scene = sceneName ?? this.state.currentScene;
      if (scene) {
        try {
          const res = await this.call<{ sceneItems: any[] }>("GetSceneItemList", { sceneName: scene });
          this.state.sceneItems = (res.sceneItems || []).slice().reverse().map((item) => ({
            sceneItemId: item.sceneItemId,
            sourceName: item.sourceName,
            inputKind: item.inputKind || "",
            sourceType: item.sourceType || "",
            sceneItemEnabled: item.sceneItemEnabled,
            isGroup: Boolean(item.isGroup),
          }));
          this.emitState();
        } catch {
          /* scene may have changed mid-flight — ignore */
        }
      } else {
        this.state.sceneItems = [];
      }
    }

    const vScene = isVertical ? (sceneName ?? this.state.verticalCurrentScene) : (this.state.verticalCurrentScene || (this.state.verticalScenes.length > 0 ? this.state.verticalScenes[0] : ""));
    if (vScene) {
      try {
        const reqData: any = { sceneName: vScene };
        if (this.state.verticalCanvasUuid) reqData.canvasUuid = this.state.verticalCanvasUuid;
        const res = await this.call<{ sceneItems: any[] }>("GetSceneItemList", reqData);
        this.state.verticalSceneItems = (res.sceneItems || []).slice().reverse().map((item) => ({
          sceneItemId: item.sceneItemId,
          sourceName: item.sourceName,
          inputKind: item.inputKind || "",
          sourceType: item.sourceType || "",
          sceneItemEnabled: item.sceneItemEnabled,
          isGroup: Boolean(item.isGroup),
        }));
        this.emitState();
      } catch {
        /* ignore */
      }
    } else {
      this.state.verticalSceneItems = [];
    }
  }

  private async refreshAudioInputs(): Promise<void> {
    try {
      const res = await this.call<{ inputs: { inputName: string; inputKind: string }[] }>(
        "GetInputList"
      );
      const settled = await Promise.allSettled(
        res.inputs.map(async (input) => {
          const [muteRes, volRes] = await Promise.all([
            this.call<{ inputMuted: boolean }>("GetInputMute", { inputName: input.inputName }),
            this.call<{ inputVolumeMul: number; inputVolumeDb: number }>("GetInputVolume", {
              inputName: input.inputName,
            }),
          ]);
          const audioInput: ObsAudioInput = {
            inputName: input.inputName,
            inputKind: input.inputKind,
            muted: muteRes.inputMuted,
            volumeMul: volRes.inputVolumeMul,
            volumeDb: volRes.inputVolumeDb,
          };
          return audioInput;
        })
      );
      this.state.audioInputs = settled
        .filter((r): r is PromiseFulfilledResult<ObsAudioInput> => r.status === "fulfilled")
        .map((r) => r.value);
      this.emitState();
    } catch {
      /* ignore */
    }
  }

  private updateStreamStatusFromResponse(stream: any): void {
    const active = Boolean(stream.outputActive);
    this.state.streaming.active = active;
    if (!active) {
      this.state.streaming.timecode = "00:00:00";
      this.streamStartedAt = null;
      this.state.streaming.startedAt = null;
      this.lastStreamObsDuration = null;
      this.lastStreamWallTime = null;
      this.streamTracksFactor = 1;
    } else {
      const now = Date.now();
      const obsDuration = typeof stream.outputDuration === "number"
        ? stream.outputDuration
        : parseTimecodeToMs(stream.outputTimecode || "");

      if (this.lastStreamObsDuration !== null && this.lastStreamWallTime !== null) {
        const deltaObs = obsDuration - this.lastStreamObsDuration;
        const deltaWall = now - this.lastStreamWallTime;
        if (deltaWall >= 1000 && deltaObs >= 500) {
          const estimatedFactor = Math.round(deltaObs / deltaWall);
          if (estimatedFactor >= 1 && estimatedFactor <= 32) {
            this.streamTracksFactor = estimatedFactor;
          }
        }
      }
      this.lastStreamObsDuration = obsDuration;
      this.lastStreamWallTime = now;

      if (this.streamStartedAt === null || Math.abs(now - this.streamStartedAt) < 3000) {
        if (obsDuration > 2000) {
          const trueElapsedMs = obsDuration / this.streamTracksFactor;
          this.streamStartedAt = now - trueElapsedMs;
          this.state.streaming.startedAt = this.streamStartedAt;
        } else if (this.streamStartedAt === null) {
          this.streamStartedAt = now;
          this.state.streaming.startedAt = this.streamStartedAt;
        }
      }
      this.state.streaming.timecode = formatTimecodeFromMs(Math.max(0, now - (this.streamStartedAt ?? now)));
    }
  }

  private updateRecordStatusFromResponse(record: any): void {
    const active = Boolean(record.outputActive);
    const paused = Boolean(record.outputPaused);
    this.state.recording.active = active;
    this.state.recording.paused = paused;
    if (!active) {
      this.state.recording.timecode = "00:00:00";
      this.recordStartedAt = null;
      this.state.recording.startedAt = null;
      this.lastRecordObsDuration = null;
      this.lastRecordWallTime = null;
      this.recordTracksFactor = 1;
    } else {
      const now = Date.now();
      const obsDuration = typeof record.outputDuration === "number"
        ? record.outputDuration
        : parseTimecodeToMs(record.outputTimecode || "");

      if (!paused && this.lastRecordObsDuration !== null && this.lastRecordWallTime !== null) {
        const deltaObs = obsDuration - this.lastRecordObsDuration;
        const deltaWall = now - this.lastRecordWallTime;
        if (deltaWall >= 1000 && deltaObs >= 500) {
          const estimatedFactor = Math.round(deltaObs / deltaWall);
          if (estimatedFactor >= 1 && estimatedFactor <= 32) {
            this.recordTracksFactor = estimatedFactor;
          }
        }
      }
      this.lastRecordObsDuration = obsDuration;
      this.lastRecordWallTime = now;

      if (this.recordStartedAt === null || Math.abs(now - this.recordStartedAt) < 3000) {
        if (obsDuration > 2000) {
          const trueElapsedMs = obsDuration / this.recordTracksFactor;
          this.recordStartedAt = now - trueElapsedMs;
          this.state.recording.startedAt = this.recordStartedAt;
        } else if (this.recordStartedAt === null) {
          this.recordStartedAt = now;
          this.state.recording.startedAt = this.recordStartedAt;
        }
      }
      if (!paused && this.recordStartedAt !== null) {
        this.state.recording.timecode = formatTimecodeFromMs(Math.max(0, now - this.recordStartedAt));
      } else if (record.outputTimecode) {
        this.state.recording.timecode = record.outputTimecode.split(".")[0] || "00:00:00";
      }
    }
  }

  async getGroupSceneItemList(groupName: string, canvasUuid?: string | null): Promise<ObsSceneItem[]> {
    if (this.status !== "connected") return [];
    try {
      const reqData: any = { sceneName: groupName };
      if (canvasUuid) reqData.canvasUuid = canvasUuid;
      const res = await this.call<{ sceneItems: any[] }>("GetGroupSceneItemList", reqData);
      return (res?.sceneItems || []).slice().reverse().map((item: any) => ({
        sceneItemId: item.sceneItemId,
        sourceName: item.sourceName,
        inputKind: item.inputKind || "",
        sourceType: item.sourceType || "",
        sceneItemEnabled: item.sceneItemEnabled,
        isGroup: Boolean(item.isGroup),
      }));
    } catch {
      return [];
    }
  }

  async getSourceScreenshot(
    sourceName: string,
    imageWidth = 960,
    imageFormat = "jpeg",
    imageCompressionQuality = 75,
    canvasUuid?: string | null
  ): Promise<string | null> {
    if (this.status !== "connected") return null;
    try {
      const reqData: any = {
        sourceName,
        imageFormat,
        imageWidth,
        imageCompressionQuality,
      };
      if (canvasUuid) reqData.canvasUuid = canvasUuid;
      const res = await this.call<{ imageData: string }>("GetSourceScreenshot", reqData);
      if (!res?.imageData) return null;
      if (res.imageData.startsWith("data:")) return res.imageData;
      return `data:image/${imageFormat};base64,${res.imageData}`;
    } catch {
      return null;
    }
  }

  private async refreshStats(): Promise<void> {
    try {
      const stats = await this.call<any>("GetStats");
      this.state.stats = {
        cpu: stats.cpuUsage ?? 0,
        fps: stats.activeFps ?? 0,
        renderLagMs: stats.averageFrameRenderTime ?? 0,
        droppedFrames: stats.outputSkippedFrames ?? 0,
        totalFrames: stats.outputTotalFrames ?? 0,
      };
    } catch {
      /* ignore */
    }
  }

  private async refreshOutputs(): Promise<void> {
    try {
      const stream = await this.call<any>("GetStreamStatus");
      this.updateStreamStatusFromResponse(stream);
    } catch {
      /* ignore */
    }
    try {
      const record = await this.call<any>("GetRecordStatus");
      this.updateRecordStatusFromResponse(record);
    } catch {
      /* ignore */
    }
    try {
      const vcam = await this.call<any>("GetVirtualCamStatus");
      this.state.virtualCam = Boolean(vcam.outputActive);
    } catch {
      /* ignore */
    }
    try {
      const replay = await this.call<any>("GetReplayBufferStatus");
      this.state.replayBuffer = Boolean(replay.outputActive);
    } catch {
      /* ignore */
    }
    try {
      const studio = await this.call<any>("GetStudioModeEnabled");
      this.state.studioModeEnabled = Boolean(studio.studioModeEnabled);
    } catch {
      /* ignore */
    }
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(async () => {
      try {
        const stream = await this.call<any>("GetStreamStatus");
        this.updateStreamStatusFromResponse(stream);
      } catch {
        /* ignore */
      }
      try {
        const record = await this.call<any>("GetRecordStatus");
        this.updateRecordStatusFromResponse(record);
      } catch {
        /* ignore */
      }
      await this.refreshScenes();
      await this.refreshStats();
      this.emitState();
    }, POLL_MS);
  }

  private handleEvent(type: string, data: any): void {
    switch (type) {
      case "CurrentSceneTransitionDurationChanged":
      case "CurrentSceneTransitionChanged":
        if (typeof data?.transitionDuration === "number") {
          this.state.transitionDuration = data.transitionDuration;
        }
        break;
      case "VendorEvent":
      case "CustomEvent": {
        const vSceneName = data?.eventData?.scene || data?.eventData?.sceneName || data?.scene || data?.sceneName;
        if (vSceneName && typeof vSceneName === "string" && this.state.verticalScenes.includes(vSceneName)) {
          this.state.verticalCurrentScene = vSceneName;
          void this.refreshSceneItems(vSceneName, true);
        }
        void this.refreshScenes();
        break;
      }
      case "SceneTransitionStarted": {
        const dur = typeof data?.transitionDuration === "number" && data.transitionDuration > 0
          ? data.transitionDuration
          : (this.state.transitionDuration || 300);
        if (typeof data?.transitionDuration === "number") {
          this.state.transitionDuration = dur;
        }
        window.dispatchEvent(new CustomEvent("sc:obs-transition", { detail: dur }));
        void this.refreshScenes();
        break;
      }
      case "SceneTransitionEnded":
        window.dispatchEvent(new CustomEvent("sc:obs-transition-end"));
        void this.refreshScenes();
        break;
      case "CurrentProgramSceneChanged":
        if (data.canvasUuid && data.canvasUuid === this.state.verticalCanvasUuid) {
          this.state.verticalCurrentScene = data.sceneName;
          void this.refreshSceneItems(data.sceneName, true);
        } else if (!data.canvasUuid || data.canvasUuid !== this.state.verticalCanvasUuid) {
          if (this.state.verticalScenes.includes(data.sceneName) && this.state.verticalCanvasUuid) {
            this.state.verticalCurrentScene = data.sceneName;
            void this.refreshSceneItems(data.sceneName, true);
          } else {
            this.state.currentScene = data.sceneName;
            void this.refreshSceneItems(data.sceneName, false);
          }
        }
        break;
      case "CurrentPreviewSceneChanged":
        if (data.canvasUuid && data.canvasUuid === this.state.verticalCanvasUuid) {
          this.state.verticalPreviewScene = data.sceneName;
        } else if (!data.canvasUuid || data.canvasUuid !== this.state.verticalCanvasUuid) {
          if (this.state.verticalScenes.includes(data.sceneName) && this.state.verticalCanvasUuid) {
            this.state.verticalPreviewScene = data.sceneName;
          } else {
            this.state.previewScene = data.sceneName;
          }
        }
        break;
      case "SceneListChanged":
        if (data.canvasUuid && data.canvasUuid === this.state.verticalCanvasUuid) {
          this.state.verticalScenes = (data.scenes || []).map((s: any) => s.sceneName);
        } else if (!data.canvasUuid || data.canvasUuid !== this.state.verticalCanvasUuid) {
          this.state.scenes = (data.scenes || []).map((s: any) => s.sceneName);
        }
        break;
      case "SceneItemEnableStateChanged": {
        if (data.canvasUuid && data.canvasUuid === this.state.verticalCanvasUuid) {
          const item = this.state.verticalSceneItems.find((i) => i.sceneItemId === data.sceneItemId);
          if (item) item.sceneItemEnabled = data.sceneItemEnabled;
        } else if (data.sceneName === this.state.currentScene) {
          const item = this.state.sceneItems.find((i) => i.sceneItemId === data.sceneItemId);
          if (item) item.sceneItemEnabled = data.sceneItemEnabled;
        }
        break;
      }
      case "SceneItemCreated":
      case "SceneItemRemoved":
      case "SceneItemListReindexed":
        if (data.canvasUuid && data.canvasUuid === this.state.verticalCanvasUuid) {
          void this.refreshSceneItems(undefined, true);
        } else if (data.sceneName === this.state.currentScene) {
          void this.refreshSceneItems(undefined, false);
        }
        break;
      case "InputMuteStateChanged": {
        const input = this.state.audioInputs.find((i) => i.inputName === data.inputName);
        if (input) input.muted = data.inputMuted;
        break;
      }
      case "InputVolumeChanged": {
        const input = this.state.audioInputs.find((i) => i.inputName === data.inputName);
        if (input) {
          input.volumeMul = data.inputVolumeMul;
          if (typeof data.inputVolumeDb === "number") {
            input.volumeDb = data.inputVolumeDb;
          }
        }
        break;
      }
      case "InputCreated":
      case "InputRemoved":
      case "InputNameChanged":
        void this.refreshAudioInputs();
        break;
      case "StreamStateChanged": {
        const active = Boolean(data.outputActive);
        this.state.streaming.active = active;
        if (active) {
          if (this.streamStartedAt === null) {
            this.streamStartedAt = Date.now();
            this.state.streaming.startedAt = this.streamStartedAt;
            this.streamTracksFactor = 1;
            this.lastStreamWallTime = Date.now();
            this.lastStreamObsDuration = 0;
            this.state.streaming.timecode = "00:00:00";
          }
        } else {
          this.state.streaming.timecode = "00:00:00";
          this.streamStartedAt = null;
          this.state.streaming.startedAt = null;
          this.lastStreamObsDuration = null;
          this.lastStreamWallTime = null;
          this.streamTracksFactor = 1;
        }
        break;
      }
      case "RecordStateChanged": {
        const active = Boolean(data.outputActive);
        this.state.recording.active = active;
        if (active) {
          if (this.recordStartedAt === null) {
            this.recordStartedAt = Date.now();
            this.state.recording.startedAt = this.recordStartedAt;
            this.recordTracksFactor = 1;
            this.lastRecordWallTime = Date.now();
            this.lastRecordObsDuration = 0;
            this.state.recording.timecode = "00:00:00";
          }
        } else {
          this.state.recording.timecode = "00:00:00";
          this.recordStartedAt = null;
          this.state.recording.startedAt = null;
          this.lastRecordObsDuration = null;
          this.lastRecordWallTime = null;
          this.recordTracksFactor = 1;
        }
        break;
      }
      case "VirtualcamStateChanged":
        this.state.virtualCam = Boolean(data.outputActive);
        break;
      case "ReplayBufferStateChanged":
        this.state.replayBuffer = Boolean(data.outputActive);
        break;
      case "StudioModeStateChanged":
        this.state.studioModeEnabled = Boolean(data.studioModeEnabled);
        break;
      default:
        break;
    }
    this.emitState();
  }
}
