// ============================================================
// Stream Control — Alert Execution Engine
// Sequential / Concurrent / Blocking Queue Runner
// ============================================================

import type {
  AlertAction,
  AlertTrigger,
  ConditionOperator,
  EngineEvent,
  ExecutionContext,
  LiveRedemptionQueueItem,
  QueueMode,
  RedemptionStatus,
  SubAction,
  SubActionCategory,
  SubActionMeta,
  TriggerMeta,
  TriggerType,
  ActionGroup,
} from "../types/alerts";
import { nanoid } from "../lib/nanoid";

export function emitAlertsOverlayEvent(data: any): void {
  if (!data) return;
  const normalized = {
    ...data,
    type: data.type === "play_audio" || data.type === "audio" ? "audio" : "visual",
    url: data.src || data.url || "",
    bannerText: data.bannerText || data.text || "",
    durationMs: typeof data.durationMs === "number" && data.durationMs > 0 ? data.durationMs : 4500,
    animation: data.animation || "bounce",
    volume: typeof data.volume === "number" ? data.volume : 80,
    _id: typeof data._id === "number" ? data._id : Date.now() + Math.random(),
    timestamp: Date.now(),
  };

  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent("sc:alerts-overlay-event", { detail: normalized }));
    } catch {
      /* ignore */
    }
    try {
      localStorage.setItem("sc:alerts-overlay-event", JSON.stringify(normalized));
    } catch {
      /* ignore */
    }
  }

  if (typeof BroadcastChannel !== "undefined") {
    try {
      const ch = new BroadcastChannel("sc:alerts-overlay-channel");
      ch.postMessage(normalized);
      setTimeout(() => ch.close(), 500);
    } catch {
      /* ignore */
    }
  }

  const endpoints = [
    "/api/alerts/emit",
    "http://127.0.0.1:8080/api/alerts/emit",
    "http://localhost:8080/api/alerts/emit",
  ];
  const uniqueEndpoints = Array.from(new Set(endpoints));
  for (const endpoint of uniqueEndpoints) {
    try {
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalized),
      }).catch(() => {});
    } catch {
      /* ignore */
    }
  }
}

// ─────────────────────────────────────────────
// TINY NANOID SHIM (no external dep)
// ─────────────────────────────────────────────
// imported from src/lib/nanoid.ts

// ─────────────────────────────────────────────
// VARIABLE INTERPOLATION
// ─────────────────────────────────────────────

/**
 * Replace all %variable% tokens in a string using the execution context.
 * Looks in local vars first, then global vars.
 */
export function replaceVars(
  template: string,
  ctx: ExecutionContext
): string {
  return template.replace(/%([^%]+)%/g, (_match, key: string) => {
    const k = key.toLowerCase();
    if (ctx.vars[k] !== undefined) return ctx.vars[k];
    if (ctx.globalVars[k] !== undefined) return ctx.globalVars[k];
    return `%${key}%`; // leave unreplaced if not found
  });
}

// ─────────────────────────────────────────────
// CONDITION EVALUATION
// ─────────────────────────────────────────────

export function evaluateCondition(
  left: string,
  operator: ConditionOperator,
  right: string
): boolean {
  const leftNum = parseFloat(left);
  const rightNum = parseFloat(right);

  switch (operator) {
    case "equals":
      return left === right;
    case "not_equals":
      return left !== right;
    case "greater_than":
      return !isNaN(leftNum) && !isNaN(rightNum) && leftNum > rightNum;
    case "less_than":
      return !isNaN(leftNum) && !isNaN(rightNum) && leftNum < rightNum;
    case "contains":
      return left.toLowerCase().includes(right.toLowerCase());
    case "not_contains":
      return !left.toLowerCase().includes(right.toLowerCase());
    case "regex": {
      try {
        return new RegExp(right, "i").test(left);
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

// ─────────────────────────────────────────────
// MATH OPERATIONS
// ─────────────────────────────────────────────

function applyMath(
  current: string,
  operation: string,
  value: string
): string {
  if (operation === "set") return value;
  const cur = parseFloat(current) || 0;
  const val = parseFloat(value) || 0;
  switch (operation) {
    case "add":      return String(cur + val);
    case "subtract": return String(cur - val);
    case "multiply": return String(cur * val);
    case "divide":   return val !== 0 ? String(cur / val) : current;
    default:         return value;
  }
}

// ─────────────────────────────────────────────
// SUB-ACTION EXECUTOR
// ─────────────────────────────────────────────

type OBSClient = {
  call: (requestType: string, requestData?: Record<string, unknown>) => Promise<unknown>;
} | null;

interface EngineRunOptions {
  obsClient?: OBSClient;
  obsState?: {
    verticalCanvasUuid?: string | null;
    currentScene?: string;
    verticalCurrentScene?: string;
  };
  allActions?: AlertAction[];
  globalVarsRef?: Record<string, string>;
  onGlobalVarChange?: (key: string, value: string) => void;
  onLog?: (line: string) => void;
  onRedemptionStatusChange?: (id: string, status: RedemptionStatus) => void;
  onOverlayEvent?: (event: OverlayEvent) => void;
}

export interface OverlayEvent {
  type: "play_audio" | "display_visual";
  src: string;
  volume?: number;
  durationMs?: number;
  animation?: string;
  position?: string;
  bannerText?: string;
  bannerEnabled?: boolean;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runSubActions(
  subActions: SubAction[],
  ctx: ExecutionContext,
  opts: EngineRunOptions
): Promise<void> {
  for (const sa of subActions) {
    if (ctx.shouldBreak) break;
    if (!sa.enabled) continue;

    const log = (msg: string) => {
      const line = `[${new Date().toLocaleTimeString()}] [${sa.options.kind}] ${msg}`;
      ctx.log.push(line);
      opts.onLog?.(line);
    };

    try {
      await executeSingleSubAction(sa, ctx, opts, log);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`ERROR: ${msg}`);
    }
  }
}

async function executeSingleSubAction(
  sa: SubAction,
  ctx: ExecutionContext,
  opts: EngineRunOptions,
  log: (msg: string) => void
): Promise<void> {
  const o = sa.options;

  // ─── LOGIC ──────────────────────────────────
  if (o.kind === "delay") {
    log(`Waiting ${o.delayMs}ms…`);
    await sleep(o.delayMs);
    return;
  }

  if (o.kind === "break") {
    ctx.shouldBreak = true;
    log("Break — halting execution chain.");
    return;
  }

  if (o.kind === "set_variable") {
    const resolved = replaceVars(o.value, ctx);
    if (o.scope === "global") {
      const current = ctx.globalVars[o.variableName] ?? "0";
      const next = applyMath(current, o.operation, resolved);
      ctx.globalVars[o.variableName] = next;
      opts.onGlobalVarChange?.(o.variableName, next);
      log(`Global %${o.variableName}% ${o.operation} ${resolved} → ${next}`);
    } else {
      const current = ctx.vars[o.variableName] ?? "0";
      const next = applyMath(current, o.operation, resolved);
      ctx.vars[o.variableName] = next;
      log(`Local %${o.variableName}% ${o.operation} ${resolved} → ${next}`);
    }
    return;
  }

  if (o.kind === "if_else") {
    const left = replaceVars(o.leftVar, ctx);
    const right = replaceVars(o.rightValue, ctx);
    const result = evaluateCondition(left, o.operator, right);
    log(`IF "${left}" ${o.operator} "${right}" → ${result ? "TRUE (then)" : "FALSE (else)"}`);
    const branch = result ? o.thenSubActions : o.elseSubActions;
    await runSubActions(branch, ctx, opts);
    return;
  }

  if (o.kind === "run_action") {
    const target = opts.allActions?.find((a) => a.id === o.targetActionId);
    if (!target) {
      log(`run_action: action "${o.targetActionName}" not found.`);
      return;
    }
    log(`Running action "${target.name}" (${o.mode})`);
    const childCtx: ExecutionContext = {
      ...ctx,
      vars: { ...ctx.vars },
      log: ctx.log,
      shouldBreak: false,
    };
    if (o.mode === "async") {
      runSubActions(target.subActions, childCtx, opts).catch(console.error);
    } else {
      await runSubActions(target.subActions, childCtx, opts);
    }
    return;
  }

  // ─── PLATFORM ───────────────────────────────
  if (o.kind === "twitch_chat_message") {
    const msg = replaceVars(o.message, ctx);
    log(`[${o.platform.toUpperCase()} Chat] ${o.replyToUser ? `@${ctx.vars["user"] ?? "user"} ` : ""}${msg}`);
    // Real integration: POST to Twitch/Kick chat API
    // Simulated here — in production hook into EventSub / IRC WebSocket
    return;
  }

  if (o.kind === "twitch_update_reward_status") {
    const redemptionId = ctx.redemptionItem?.id ?? ctx.redemptionItem?.redemptionId ?? ctx.vars["redemption_id"] ?? "";
    const statusVal = o.status === "fulfilled" ? "fulfilled" : "canceled";
    log(`Twitch Reward → ${statusVal} (redemptionId: ${redemptionId || "Active Queue Item"})`);
    if (redemptionId && opts.onRedemptionStatusChange) {
      opts.onRedemptionStatusChange(redemptionId, statusVal);
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("sc:redemption-status-update", { detail: { id: redemptionId, status: statusVal } }));
    }
    return;
  }

  if (o.kind === "twitch_target_info") {
    const targetUser = replaceVars(o.targetVar, ctx);
    log(`Fetching Twitch info for ${targetUser}…`);
    // Stub — real integration hits Twitch Helix API
    ctx.vars["target_id"] = "123456";
    ctx.vars["target_display_name"] = targetUser;
    ctx.vars["target_profile_image"] = "";
    ctx.vars["follow_age"] = "0 days";
    ctx.vars["account_age"] = "Unknown";
    return;
  }

  if (o.kind === "twitch_create_clip") {
    if (o.hasDelay) await sleep(2000);
    log(`Creating Twitch clip…`);
    const fakeUrl = `https://clips.twitch.tv/clip-${Date.now()}`;
    ctx.vars[o.storeAs] = fakeUrl;
    log(`Clip URL stored in %${o.storeAs}%: ${fakeUrl}`);
    return;
  }

  if (o.kind === "twitch_timeout_ban") {
    const target = replaceVars(o.targetVar, ctx);
    const reason = replaceVars(o.reason, ctx);
    if (o.action === "timeout") {
      log(`Timeout: ${target} for ${o.durationSeconds}s — ${reason}`);
    } else {
      log(`Ban: ${target} — ${reason}`);
    }
    return;
  }

  // ─── OBS ────────────────────────────────────
  if (o.kind === "obs_source_visibility") {
    if (!opts.obsClient) { log("OBS not connected."); return; }
    const canvasUuid = opts.obsState?.verticalCanvasUuid ?? null;

    const setVisibility = async (canvasId?: string | null) => {
      let enabled: boolean;
      if (o.state === "toggle") {
        // For toggle, we'd need current state; default to true
        enabled = true;
      } else {
        enabled = o.state === "visible";
      }
      await opts.obsClient!.call("SetSceneItemEnabled", {
        sceneName: o.sceneName,
        sceneItemId: 0, // In real usage, look up by source name
        sceneItemEnabled: enabled,
        ...(canvasId ? { canvasUuid: canvasId } : {}),
      });
    };

    if (o.canvas === "main" || o.canvas === "both") await setVisibility();
    if (o.canvas === "vertical" || o.canvas === "both") await setVisibility(canvasUuid);
    log(`OBS Source "${o.sourceName}" → ${o.state} on ${o.canvas} canvas`);
    return;
  }

  if (o.kind === "obs_switch_scene") {
    if (!opts.obsClient) { log("OBS not connected."); return; }
    const canvasUuid = opts.obsState?.verticalCanvasUuid ?? null;
    const requestType = o.target === "preview" ? "SetPreviewScene" : "SetCurrentProgramScene";

    if (o.canvas === "main" || o.canvas === "both") {
      await opts.obsClient.call(requestType, { sceneName: o.sceneName });
    }
    if (o.canvas === "vertical" || o.canvas === "both") {
      await opts.obsClient.call(requestType, {
        sceneName: o.sceneName,
        ...(canvasUuid ? { canvasUuid } : {}),
      });
    }
    log(`OBS Switch Scene → "${o.sceneName}" (${o.canvas} / ${o.target})`);
    return;
  }

  if (o.kind === "obs_set_text") {
    if (!opts.obsClient) { log("OBS not connected."); return; }
    const text = replaceVars(o.text, ctx);
    await opts.obsClient.call("SetInputSettings", {
      inputName: o.sourceName,
      inputSettings: { text },
    });
    log(`OBS Text "${o.sourceName}" → "${text}"`);
    return;
  }

  if (o.kind === "obs_media_control") {
    if (!opts.obsClient) { log("OBS not connected."); return; }
    const mediaActionMap: Record<string, string> = {
      play: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY",
      pause: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE",
      restart: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART",
      stop: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP",
    };
    await opts.obsClient.call("TriggerMediaInputAction", {
      inputName: o.sourceName,
      mediaAction: mediaActionMap[o.action],
    });
    log(`OBS Media "${o.sourceName}" → ${o.action}`);
    return;
  }

  if (o.kind === "obs_audio_control") {
    if (!opts.obsClient) { log("OBS not connected."); return; }
    if (o.mode === "mute" || o.mode === "unmute") {
      await opts.obsClient.call("SetInputMute", {
        inputName: o.sourceName,
        inputMuted: o.mode === "mute",
      });
      log(`OBS Audio "${o.sourceName}" → ${o.mode}`);
    } else {
      const settings: Record<string, unknown> = {};
      if (o.mode === "volume_db") settings.inputVolumeDb = o.value ?? 0;
      if (o.mode === "volume_mul") settings.inputVolumeMul = o.value ?? 1;
      await opts.obsClient.call("SetInputVolume", {
        inputName: o.sourceName,
        ...settings,
      });
      log(`OBS Audio "${o.sourceName}" volume → ${o.value} (${o.mode})`);
    }
    return;
  }

  // ─── OVERLAY ────────────────────────────────
  if (o.kind === "play_audio") {
    log(`Play Audio: ${o.src} at ${o.volume}% → ${o.target}`);
    const evt = {
      type: "play_audio" as const,
      src: o.src,
      volume: o.volume,
    };
    emitAlertsOverlayEvent(evt);
    opts.onOverlayEvent?.(evt);
    return;
  }

  if (o.kind === "display_visual") {
    const banner = replaceVars(o.bannerText, ctx);
    log(`Display Visual: ${o.src} for ${o.durationMs}ms at ${o.position} (${o.animation})`);
    const evt = {
      type: "display_visual" as const,
      src: o.src,
      durationMs: o.durationMs,
      animation: o.animation,
      position: o.position,
      bannerText: banner,
      bannerEnabled: o.bannerEnabled,
    };
    emitAlertsOverlayEvent(evt);
    opts.onOverlayEvent?.(evt);
    return;
  }

  // ─── EXTERNAL ───────────────────────────────
  if (o.kind === "http_request") {
    const url = replaceVars(o.url, ctx);
    const body = o.body ? replaceVars(o.body, ctx) : undefined;
    log(`HTTP ${o.method} → ${url}`);
    try {
      const response = await fetch(url, {
        method: o.method,
        headers: o.headers,
        body: body && o.method !== "GET" ? body : undefined,
      });
      const text = await response.text();
      log(`HTTP Response (${response.status}): ${text.slice(0, 200)}`);
      try {
        const json = JSON.parse(text) as Record<string, unknown>;
        for (const [k, v] of Object.entries(json)) {
          ctx.vars[`${o.responseVar}_${k}`] = String(v);
        }
      } catch {
        ctx.vars[`${o.responseVar}_raw`] = text;
      }
    } catch (err) {
      log(`HTTP Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }

  if (o.kind === "discord_webhook") {
    const webhookUrl = o.webhookUrl;
    const title = replaceVars(o.title, ctx);
    const description = replaceVars(o.description, ctx);
    const authorName = replaceVars(o.authorName, ctx);
    const colorHex = parseInt(o.color.replace("#", ""), 16);
    const payload = {
      embeds: [
        {
          title,
          description,
          color: colorHex,
          author: { name: authorName },
          thumbnail: o.thumbnailUrl ? { url: o.thumbnailUrl } : undefined,
          fields: o.fields.map((f) => ({
            name: replaceVars(f.name, ctx),
            value: replaceVars(f.value, ctx),
            inline: f.inline ?? false,
          })),
          timestamp: new Date().toISOString(),
        },
      ],
    };
    log(`Discord Webhook → "${title}"`);
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      log(`Discord Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }
}

// ─────────────────────────────────────────────
// QUEUE MANAGER
// ─────────────────────────────────────────────

type QueueTask = () => Promise<void>;

class FIFOQueue {
  private queue: QueueTask[] = [];
  private running = false;

  enqueue(task: QueueTask): void {
    this.queue.push(task);
    if (!this.running) this.drain();
  }

  private async drain(): Promise<void> {
    this.running = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      await task().catch(console.error);
    }
    this.running = false;
  }

  get busy(): boolean {
    return this.running;
  }
}

class BlockingQueue extends FIFOQueue {
  // Same as FIFO but signals to other queues to pause
  isBlocking = false;

  enqueue(task: QueueTask): void {
    this.isBlocking = true;
    const wrapped: QueueTask = async () => {
      this.isBlocking = true;
      await task();
      this.isBlocking = false;
    };
    super.enqueue(wrapped);
  }
}

// Global queue registry
const fifoQueue = new FIFOQueue();
const blockingQueue = new BlockingQueue();

export function dispatchToQueue(
  mode: QueueMode,
  task: QueueTask
): void {
  switch (mode) {
    case "blocking":
      blockingQueue.enqueue(task);
      break;
    case "concurrent":
      task().catch(console.error);
      break;
    case "fifo":
    default:
      fifoQueue.enqueue(task);
      break;
  }
}

// ─────────────────────────────────────────────
// ENGINE ENTRY POINT
// ─────────────────────────────────────────────

export interface AlertEngineOptions extends EngineRunOptions {
  onRedemptionStatusChange?: (
    id: string,
    status: RedemptionStatus,
    error?: string
  ) => void;
  onLog?: (line: string) => void;
}

export function createExecutionContext(
  action: AlertAction,
  event: EngineEvent,
  globalVars: Record<string, string>,
  redemptionItem?: LiveRedemptionQueueItem
): ExecutionContext {
  return {
    vars: { ...event.vars },
    globalVars: { ...globalVars },
    redemptionItem,
    actionId: action.id,
    shouldBreak: false,
    log: [],
  };
}

export async function executeAction(
  action: AlertAction,
  event: EngineEvent,
  opts: AlertEngineOptions
): Promise<void> {
  const globalVars = opts.globalVarsRef ?? {};
  const ctx = createExecutionContext(action, event, globalVars, event.vars["_redemptionItem"] as unknown as LiveRedemptionQueueItem | undefined);

  const task = async () => {
    opts.onRedemptionStatusChange?.(action.id, "executing");
    try {
      await runSubActions(action.subActions, ctx, opts);
      opts.onRedemptionStatusChange?.(action.id, "fulfilled");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      opts.onRedemptionStatusChange?.(action.id, "error", msg);
    }
    // Sync any global var mutations back
    if (opts.globalVarsRef) {
      Object.assign(opts.globalVarsRef, ctx.globalVars);
    }
  };

  dispatchToQueue(action.queueMode, task);
}

// ─────────────────────────────────────────────
// TRIGGER → ACTION MATCHING
// ─────────────────────────────────────────────

export function findMatchingActions(
  event: EngineEvent,
  actions: AlertAction[]
): AlertAction[] {
  return actions.filter((action) => {
    if (!action.enabled) return false;
    return action.triggers.some((trigger) =>
      triggerMatchesEvent(trigger, event)
    );
  });
}

function triggerMatchesEvent(
  trigger: AlertTrigger,
  event: EngineEvent
): boolean {
  if (!trigger.enabled) return false;
  if (trigger.type !== event.type) return false;

  const c = trigger.criteria;

  // Sub criteria checks
  if (trigger.type === "twitch_reward") {
    if (c.rewardId && c.rewardId !== "" && c.rewardId !== event.vars["reward_id"]) return false;
    if (c.rewardTitle && c.rewardTitle !== "" && c.rewardTitle !== event.vars["reward"]) return false;
  }

  if (trigger.type === "twitch_cheer") {
    const bits = parseInt(event.vars["bits"] ?? "0");
    if (c.minBits && bits < c.minBits) return false;
  }

  if (trigger.type === "twitch_raid") {
    const viewers = parseInt(event.vars["viewers"] ?? "0");
    if (c.minViewers && viewers < c.minViewers) return false;
  }

  if (
    trigger.type === "twitch_sub" ||
    trigger.type === "twitch_resub" ||
    trigger.type === "twitch_gift_sub"
  ) {
    if (c.tiers && c.tiers.length > 0) {
      const tier = event.vars["tier"] as string;
      if (!c.tiers.includes(tier as never)) return false;
    }
    if (trigger.type === "twitch_gift_sub" && c.minGiftCount) {
      const count = parseInt(event.vars["gift_count"] ?? "1");
      if (count < c.minGiftCount) return false;
    }
  }

  if (trigger.type === "twitch_command" || trigger.type === "kick_command") {
    if (c.command && c.command !== event.vars["command"]) return false;
    if (c.commandRoles && !c.commandRoles.includes("any" as never)) {
      const role = event.vars["user_role"] ?? "any";
      if (!c.commandRoles.includes(role as never)) return false;
    }
  }

  if (trigger.type === "obs_scene_changed") {
    if (c.sceneName && c.sceneName !== event.vars["scene_name"]) return false;
  }

  return true;
}

// ─────────────────────────────────────────────
// SUB-ACTION METADATA REGISTRY
// ─────────────────────────────────────────────

export const SUB_ACTION_REGISTRY: SubActionMeta[] = [
  // ── Logic ──
  {
    kind: "delay",
    label: "Delay / Sleep",
    description: "Wait for a specified number of milliseconds before continuing.",
    category: "logic",
    icon: "⏱",
    defaultOptions: { kind: "delay", delayMs: 1000 },
  },
  {
    kind: "set_variable",
    label: "Set Variable",
    description: "Set or modify a local or global variable using math operations.",
    category: "logic",
    icon: "📦",
    defaultOptions: {
      kind: "set_variable",
      variableName: "myVar",
      value: "0",
      operation: "set",
      scope: "local",
    },
  },
  {
    kind: "if_else",
    label: "If / Else Condition",
    description: "Branch execution based on a condition evaluated against variables.",
    category: "logic",
    icon: "🔀",
    defaultOptions: {
      kind: "if_else",
      leftVar: "%user%",
      operator: "equals",
      rightValue: "",
      thenSubActions: [],
      elseSubActions: [],
    },
  },
  {
    kind: "run_action",
    label: "Run Another Action",
    description: "Execute another Action chain synchronously or asynchronously.",
    category: "logic",
    icon: "▶",
    defaultOptions: {
      kind: "run_action",
      targetActionId: "",
      targetActionName: "",
      mode: "sync",
    },
  },
  {
    kind: "break",
    label: "Break / Stop Chain",
    description: "Halt execution of the current Sub-Action chain immediately.",
    category: "logic",
    icon: "🛑",
    defaultOptions: { kind: "break" },
  },
  // ── Platform ──
  {
    kind: "twitch_chat_message",
    label: "Send Chat Message",
    description: "Send a message to Twitch or Kick chat, optionally replying to the user.",
    category: "platform",
    icon: "💬",
    defaultOptions: {
      kind: "twitch_chat_message",
      platform: "twitch",
      message: "Thanks %user% for the support! PogChamp",
      replyToUser: false,
    },
  },
  {
    kind: "twitch_update_reward_status",
    label: "Update Reward Status",
    description: "Mark the triggering Channel Point redemption as Fulfilled or Canceled.",
    category: "platform",
    icon: "✅",
    defaultOptions: {
      kind: "twitch_update_reward_status",
      status: "fulfilled",
    },
  },
  {
    kind: "twitch_target_info",
    label: "Get Twitch User Info",
    description: "Fetch Twitch profile data for a user and inject into context variables.",
    category: "platform",
    icon: "👤",
    defaultOptions: {
      kind: "twitch_target_info",
      targetVar: "%user%",
    },
  },
  {
    kind: "twitch_create_clip",
    label: "Create Twitch Clip",
    description: "Capture a Twitch clip and store the URL in a variable.",
    category: "platform",
    icon: "🎬",
    defaultOptions: {
      kind: "twitch_create_clip",
      hasDelay: true,
      storeAs: "clip_url",
    },
  },
  {
    kind: "twitch_timeout_ban",
    label: "Timeout / Ban User",
    description: "Timeout or permanently ban a viewer on Twitch.",
    category: "platform",
    icon: "🔨",
    defaultOptions: {
      kind: "twitch_timeout_ban",
      action: "timeout",
      targetVar: "%user%",
      durationSeconds: 600,
      reason: "Triggered by automation",
    },
  },
  // ── OBS ──
  {
    kind: "obs_source_visibility",
    label: "Source Visibility",
    description: "Show, hide, or toggle an OBS source on Main, Vertical, or both canvases.",
    category: "obs",
    icon: "👁",
    defaultOptions: {
      kind: "obs_source_visibility",
      sceneName: "",
      sourceName: "",
      canvas: "main",
      state: "visible",
    },
  },
  {
    kind: "obs_switch_scene",
    label: "Switch Scene",
    description: "Transition to a scene on the Main or Aitum Vertical Canvas.",
    category: "obs",
    icon: "🎞",
    defaultOptions: {
      kind: "obs_switch_scene",
      sceneName: "",
      canvas: "main",
      target: "program",
    },
  },
  {
    kind: "obs_set_text",
    label: "Set Text Source",
    description: "Update an OBS GDI+ or FT2 text source content (supports %vars%).",
    category: "obs",
    icon: "✏️",
    defaultOptions: {
      kind: "obs_set_text",
      sceneName: "",
      sourceName: "",
      text: "%user% just subscribed! 🎉",
    },
  },
  {
    kind: "obs_media_control",
    label: "Media Control",
    description: "Play, pause, restart, or stop an OBS media source.",
    category: "obs",
    icon: "🎵",
    defaultOptions: {
      kind: "obs_media_control",
      sourceName: "",
      action: "restart",
    },
  },
  {
    kind: "obs_audio_control",
    label: "Audio Control",
    description: "Set volume (dB or multiplier) or mute/unmute an OBS audio source.",
    category: "obs",
    icon: "🔊",
    defaultOptions: {
      kind: "obs_audio_control",
      sourceName: "",
      mode: "volume_db",
      value: -6,
    },
  },
  // ── Overlay ──
  {
    kind: "play_audio",
    label: "Play Audio",
    description: "Play a sound clip via Browser Source overlay or local Web Audio.",
    category: "overlay",
    icon: "🔉",
    defaultOptions: {
      kind: "play_audio",
      src: "",
      volume: 80,
      target: "overlay",
    },
  },
  {
    kind: "display_visual",
    label: "Display Visual / Alert",
    description: "Show an animated image or video on the overlay with a banner message.",
    category: "overlay",
    icon: "🖼",
    defaultOptions: {
      kind: "display_visual",
      src: "",
      durationMs: 5000,
      animation: "bounce",
      position: "center",
      bannerText: "%user% redeemed %reward%!",
      bannerEnabled: true,
    },
  },
  // ── External ──
  {
    kind: "http_request",
    label: "HTTP Request",
    description: "Execute GET/POST/PUT/DELETE to any URL and store JSON response in variables.",
    category: "external",
    icon: "🌐",
    defaultOptions: {
      kind: "http_request",
      method: "GET",
      url: "https://api.example.com/endpoint",
      headers: { "Content-Type": "application/json" },
      body: "",
      responseVar: "http_result",
    },
  },
  {
    kind: "discord_webhook",
    label: "Discord Webhook",
    description: "Send a rich embed message to a Discord channel via webhook.",
    category: "external",
    icon: "🎮",
    defaultOptions: {
      kind: "discord_webhook",
      webhookUrl: "",
      title: "%user% just subscribed!",
      description: "A new subscriber arrived on the stream! Tier: %tier%",
      color: "#9146FF",
      authorName: "%user%",
      thumbnailUrl: "",
      fields: [],
    },
  },
];

// ─────────────────────────────────────────────
// TRIGGER METADATA REGISTRY
// ─────────────────────────────────────────────

export const TRIGGER_REGISTRY: TriggerMeta[] = [
  // Twitch
  { type: "twitch_follow", source: "twitch", label: "Twitch › Follow", icon: "❤️", defaultCriteria: {} },
  { type: "twitch_sub", source: "twitch", label: "Twitch › Subscription", icon: "⭐", defaultCriteria: { tiers: ["tier1", "tier2", "tier3"] } },
  { type: "twitch_resub", source: "twitch", label: "Twitch › Re-Subscription", icon: "🔁", defaultCriteria: { tiers: ["tier1", "tier2", "tier3"] } },
  { type: "twitch_gift_sub", source: "twitch", label: "Twitch › Gift Subscription", icon: "🎁", defaultCriteria: { tiers: ["tier1"], minGiftCount: 1 } },
  { type: "twitch_reward", source: "twitch", label: "Twitch › Channel Point Reward", icon: "🏆", defaultCriteria: { rewardTitle: "", rewardId: "" } },
  { type: "twitch_raid", source: "twitch", label: "Twitch › Incoming Raid", icon: "⚔️", defaultCriteria: { minViewers: 1 } },
  { type: "twitch_cheer", source: "twitch", label: "Twitch › Bits Cheer", icon: "💎", defaultCriteria: { minBits: 1 } },
  { type: "twitch_command", source: "twitch", label: "Twitch › Chat Command", icon: "💬", defaultCriteria: { command: "!command", commandRoles: ["any"] } },
  // Kick
  { type: "kick_follow", source: "kick", label: "Kick › Follow", icon: "💚", defaultCriteria: {} },
  { type: "kick_sub", source: "kick", label: "Kick › Subscription", icon: "💚", defaultCriteria: {} },
  { type: "kick_gift_sub", source: "kick", label: "Kick › Gift Subscription", icon: "🎁", defaultCriteria: { minGiftCount: 1 } },
  { type: "kick_command", source: "kick", label: "Kick › Chat Command", icon: "💬", defaultCriteria: { command: "!command", commandRoles: ["any"] } },
  // OBS
  { type: "obs_scene_changed", source: "obs", label: "OBS › Scene Changed", icon: "🎞", defaultCriteria: {} },
  { type: "obs_stream_started", source: "obs", label: "OBS › Stream Started", icon: "🔴", defaultCriteria: {} },
  { type: "obs_stream_stopped", source: "obs", label: "OBS › Stream Stopped", icon: "⏹", defaultCriteria: {} },
  { type: "obs_recording_started", source: "obs", label: "OBS › Recording Started", icon: "⏺", defaultCriteria: {} },
  // Hotkey / Manual
  { type: "hotkey", source: "hotkey", label: "Keyboard Hotkey", icon: "⌨️", defaultCriteria: { hotkey: "Ctrl+Shift+F1" } },
  { type: "manual", source: "manual", label: "Manual / UI Button", icon: "🖱", defaultCriteria: {} },
];

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

export function summarizeSubAction(sa: SubAction): string {
  const o = sa.options;
  switch (o.kind) {
    case "delay": return `Delay for ${o.delayMs}ms`;
    case "set_variable": return `Set %${o.variableName}% ${o.operation} "${o.value}" (${o.scope})`;
    case "if_else": return `If "${o.leftVar}" ${o.operator} "${o.rightValue}"`;
    case "run_action": return `Run Action: "${o.targetActionName}" (${o.mode})`;
    case "break": return "Break — Stop Execution";
    case "twitch_chat_message": return `[${o.platform.toUpperCase()}] Chat: "${o.message.slice(0, 40)}${o.message.length > 40 ? "…" : ""}"`;
    case "twitch_update_reward_status": return `Reward → ${o.status}`;
    case "twitch_target_info": return `Fetch Twitch Info for ${o.targetVar}`;
    case "twitch_create_clip": return `Create Clip → %${o.storeAs}%`;
    case "twitch_timeout_ban": return `${o.action === "timeout" ? `Timeout ${o.durationSeconds}s` : "Ban"}: ${o.targetVar}`;
    case "obs_source_visibility": return `OBS Visibility: "${o.sourceName}" → ${o.state} (${o.canvas})`;
    case "obs_switch_scene": return `OBS Scene → "${o.sceneName}" (${o.canvas})`;
    case "obs_set_text": return `OBS Text "${o.sourceName}": "${o.text.slice(0, 30)}…"`;
    case "obs_media_control": return `OBS Media "${o.sourceName}" → ${o.action}`;
    case "obs_audio_control": return `OBS Audio "${o.sourceName}" → ${o.mode}${o.value !== undefined ? ` ${o.value}` : ""}`;
    case "play_audio": return `Play Audio: ${o.src.split("/").pop() ?? o.src} (${o.volume}%)`;
    case "display_visual": return `Display Visual: ${o.src.split("/").pop() ?? o.src} ${o.durationMs}ms`;
    case "http_request": return `HTTP ${o.method} → ${o.url.slice(0, 40)}`;
    case "discord_webhook": return `Discord Webhook: "${o.title.slice(0, 30)}"`;
    default: return "Unknown Sub-Action";
  }
}

export function getCategoryLabel(cat: SubActionCategory): string {
  switch (cat) {
    case "logic": return "Logic & Control Flow";
    case "platform": return "Twitch & Kick";
    case "obs": return "OBS Studio";
    case "overlay": return "Audio & Visual Overlays";
    case "external": return "External / Webhooks";
  }
}

export function getCategoryColor(cat: SubActionCategory): string {
  switch (cat) {
    case "logic": return "bg-violet-500/20 text-violet-300 border-violet-500/30";
    case "platform": return "bg-purple-500/20 text-purple-300 border-purple-500/30";
    case "obs": return "bg-blue-500/20 text-blue-300 border-blue-500/30";
    case "overlay": return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
    case "external": return "bg-amber-500/20 text-amber-300 border-amber-500/30";
  }
}

export function getQueueModeColor(mode: QueueMode): string {
  switch (mode) {
    case "fifo": return "bg-blue-500/20 text-blue-300";
    case "blocking": return "bg-red-500/20 text-red-300";
    case "concurrent": return "bg-green-500/20 text-green-300";
  }
}

export function getGroupColor(group: ActionGroup): string {
  switch (group) {
    case "Alerts": return "bg-rose-500/20 text-rose-300 border-rose-500/30";
    case "Redemptions": return "bg-amber-500/20 text-amber-300 border-amber-500/30";
    case "Soundboard": return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
    case "OBS Macros": return "bg-blue-500/20 text-blue-300 border-blue-500/30";
    case "Custom": return "bg-violet-500/20 text-violet-300 border-violet-500/30";
  }
}

// ─────────────────────────────────────────────
// DEFAULT SEEDED ACTIONS
// ─────────────────────────────────────────────

function makeId(): string {
  return nanoid(10);
}

function makeTrigger(
  type: TriggerType,
  label: string,
  criteria: AlertTrigger["criteria"] = {}
): AlertTrigger {
  const meta = TRIGGER_REGISTRY.find((t) => t.type === type);
  return {
    id: makeId(),
    type,
    source: meta?.source ?? "twitch",
    label: meta?.label ?? label,
    enabled: true,
    criteria: { ...meta?.defaultCriteria, ...criteria },
  };
}

function makeSubAction(
  category: SubActionCategory,
  options: SubAction["options"]
): SubAction {
  return {
    id: makeId(),
    enabled: true,
    category,
    options,
  };
}

export const DEFAULT_ACTIONS: AlertAction[] = [
  // ─── 1. Follow Alert ───────────────────────
  {
    id: makeId(),
    name: "✨ Follow Alert",
    group: "Alerts",
    enabled: true,
    queueMode: "fifo",
    cooldownMs: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    triggers: [
      makeTrigger("twitch_follow", "Twitch › Follow"),
      makeTrigger("kick_follow", "Kick › Follow"),
    ],
    subActions: [
      makeSubAction("overlay", {
        kind: "display_visual",
        src: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcGp6enM2ZWluOGhuaGt3Z2ptbW52cmprZzNndmJycXVxdXJ6eDVqbyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/l3q2XhfQ8oCkm1Ts4/giphy.gif",
        durationMs: 5000,
        animation: "bounce",
        position: "top_center",
        bannerText: "🎉 %user% just followed!",
        bannerEnabled: true,
      }),
      makeSubAction("overlay", {
        kind: "play_audio",
        src: "https://www.myinstants.com/media/sounds/ff7-fanfare.mp3",
        volume: 70,
        target: "overlay",
      }),
      makeSubAction("platform", {
        kind: "twitch_chat_message",
        platform: "twitch",
        message: "Welcome to the stream, %user%! We're glad to have you here! 🎉",
        replyToUser: false,
      }),
    ],
  },

  // ─── 2. Paid Sub Alert ────────────────────
  {
    id: makeId(),
    name: "⭐ Subscription Alert",
    group: "Alerts",
    enabled: true,
    queueMode: "fifo",
    cooldownMs: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    triggers: [
      makeTrigger("twitch_sub", "Twitch › Subscription", {
        tiers: ["prime", "tier1", "tier2", "tier3"],
      }),
      makeTrigger("twitch_resub", "Twitch › Re-Subscription", {
        tiers: ["prime", "tier1", "tier2", "tier3"],
      }),
    ],
    subActions: [
      makeSubAction("obs", {
        kind: "obs_set_text",
        sceneName: "Game",
        sourceName: "Sub Text",
        text: "Last Sub: %user% (%tier%) 🎉",
      }),
      makeSubAction("overlay", {
        kind: "display_visual",
        src: "https://media.giphy.com/media/26tPghhxvMCY3GFri/giphy.gif",
        durationMs: 7800,
        animation: "zoom",
        position: "center",
        bannerText: "%user% just subscribed! (%tier%)",
        bannerEnabled: true,
      }),
      makeSubAction("overlay", {
        kind: "play_audio",
        src: "https://www.myinstants.com/media/sounds/anime-wow.mp3",
        volume: 80,
        target: "overlay",
      }),
      makeSubAction("platform", {
        kind: "twitch_chat_message",
        platform: "twitch",
        message: "HUGE shoutout to %user% for the %tier% sub! You're amazing! 🌟",
        replyToUser: true,
      }),
      makeSubAction("logic", {
        kind: "delay",
        delayMs: 3000,
      }),
      makeSubAction("platform", {
        kind: "twitch_update_reward_status",
        status: "fulfilled",
      }),
    ],
  },

  // ─── 3. Hydrate Check Redemption ─────────
  {
    id: makeId(),
    name: "💧 Hydrate Check Redemption",
    group: "Redemptions",
    enabled: true,
    queueMode: "fifo",
    cooldownMs: 30000,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    triggers: [
      makeTrigger("twitch_reward", "Twitch › Channel Point Reward", {
        rewardTitle: "Hydrate Check",
        rewardId: "",
      }),
    ],
    subActions: [
      makeSubAction("obs", {
        kind: "obs_source_visibility",
        sceneName: "Game",
        sourceName: "Hydrate Overlay",
        canvas: "main",
        state: "visible",
      }),
      makeSubAction("overlay", {
        kind: "play_audio",
        src: "https://www.myinstants.com/media/sounds/water-drop.mp3",
        volume: 75,
        target: "overlay",
      }),
      makeSubAction("overlay", {
        kind: "display_visual",
        src: "https://media.giphy.com/media/26FPy3QZQsMp1mbA6/giphy.gif",
        durationMs: 5000,
        animation: "slide_top",
        position: "top_center",
        bannerText: "💧 %user% says DRINK WATER! (-500 pts)",
        bannerEnabled: true,
      }),
      makeSubAction("platform", {
        kind: "twitch_chat_message",
        platform: "twitch",
        message: "💧 HYDRATE TIME! %user% redeemed Hydrate Check! Everyone drink some water! 💧",
        replyToUser: false,
      }),
      makeSubAction("logic", {
        kind: "delay",
        delayMs: 5000,
      }),
      makeSubAction("obs", {
        kind: "obs_source_visibility",
        sceneName: "Game",
        sourceName: "Hydrate Overlay",
        canvas: "main",
        state: "hidden",
      }),
      makeSubAction("platform", {
        kind: "twitch_update_reward_status",
        status: "fulfilled",
      }),
    ],
  },

  // ─── 4. Bomb Drop Camera Shake Macro ─────
  {
    id: makeId(),
    name: "💣 Bomb Drop Camera Shake",
    group: "OBS Macros",
    enabled: true,
    queueMode: "concurrent",
    cooldownMs: 10000,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    triggers: [
      makeTrigger("twitch_reward", "Twitch › Channel Point Reward", {
        rewardTitle: "Bomb Drop",
        rewardId: "",
      }),
      makeTrigger("hotkey", "Keyboard Hotkey", {
        hotkey: "Ctrl+Shift+B",
      }),
    ],
    subActions: [
      makeSubAction("overlay", {
        kind: "play_audio",
        src: "https://www.myinstants.com/media/sounds/explosion.mp3",
        volume: 90,
        target: "overlay",
      }),
      makeSubAction("overlay", {
        kind: "display_visual",
        src: "https://media.giphy.com/media/oe33xf3B50fsc/giphy.gif",
        durationMs: 3500,
        animation: "shake",
        position: "center",
        bannerText: "💣 %user% dropped a BOMB!",
        bannerEnabled: true,
      }),
      makeSubAction("obs", {
        kind: "obs_source_visibility",
        sceneName: "Game",
        sourceName: "Bomb Drop",
        canvas: "both",
        state: "visible",
      }),
      makeSubAction("obs", {
        kind: "obs_audio_control",
        sourceName: "Desktop Audio",
        mode: "volume_db",
        value: -20,
      }),
      makeSubAction("logic", {
        kind: "delay",
        delayMs: 3500,
      }),
      makeSubAction("obs", {
        kind: "obs_source_visibility",
        sceneName: "Game",
        sourceName: "Bomb Drop",
        canvas: "both",
        state: "hidden",
      }),
      makeSubAction("obs", {
        kind: "obs_audio_control",
        sourceName: "Desktop Audio",
        mode: "volume_db",
        value: 0,
      }),
      makeSubAction("platform", {
        kind: "twitch_update_reward_status",
        status: "fulfilled",
      }),
    ],
  },

  // ─── 5. Siren Soundboard ──────────────────
  {
    id: makeId(),
    name: "🚨 Siren Command",
    group: "Soundboard",
    enabled: true,
    queueMode: "concurrent",
    cooldownMs: 15000,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    triggers: [
      makeTrigger("twitch_command", "Twitch › Chat Command", {
        command: "!siren",
        commandRoles: ["moderator", "broadcaster"],
      }),
    ],
    subActions: [
      makeSubAction("overlay", {
        kind: "play_audio",
        src: "https://www.myinstants.com/media/sounds/police-siren.mp3",
        volume: 85,
        target: "overlay",
      }),
      makeSubAction("overlay", {
        kind: "display_visual",
        src: "https://media.giphy.com/media/l41YmQjOz9qg2EsiQ/giphy.gif",
        durationMs: 4500,
        animation: "bounce",
        position: "center",
        bannerText: "🚨 SIREN COMMAND TRIGGERED BY %user%!",
        bannerEnabled: true,
      }),
      makeSubAction("obs", {
        kind: "obs_source_visibility",
        sceneName: "Game",
        sourceName: "Siren Light",
        canvas: "both",
        state: "visible",
      }),
      makeSubAction("logic", {
        kind: "delay",
        delayMs: 5000,
      }),
      makeSubAction("obs", {
        kind: "obs_source_visibility",
        sceneName: "Game",
        sourceName: "Siren Light",
        canvas: "both",
        state: "hidden",
      }),
    ],
  },
];

// ─────────────────────────────────────────────
// DEMO ACTIVITY LOG
// ─────────────────────────────────────────────

export function generateDemoActivity(): LiveRedemptionQueueItem[] {
  const users = ["CoolViewer99", "StreamFan2024", "TwitchNinja", "GamingPro", "EliteCoder"];
  const rewards = ["Hydrate Check", "Bomb Drop", "Siren", "Choose Next Song", "Follow Alert"];
  const statuses: RedemptionStatus[] = ["fulfilled", "pending", "canceled", "fulfilled", "fulfilled"];
  const costs = [500, 1000, 200, 750, 100];
  const now = Date.now();

  return Array.from({ length: 8 }, (_, i) => ({
    id: nanoid(10),
    timestamp: now - i * 1000 * 60 * (i + 1),
    user: users[i % users.length],
    rewardTitle: rewards[i % rewards.length],
    cost: costs[i % costs.length],
    platform: "twitch" as const,
    status: statuses[i % statuses.length],
    redemptionId: nanoid(16),
    contextVars: {
      user: users[i % users.length],
      reward: rewards[i % rewards.length],
      cost: String(costs[i % costs.length]),
    },
  }));
}
