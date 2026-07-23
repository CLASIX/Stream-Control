// ============================================================
// Stream Control — Alerts & Redemptions Engine
// Complete Type Hierarchy
// ============================================================

// ─────────────────────────────────────────────
// VARIABLE CONTEXT
// ─────────────────────────────────────────────

export interface ExecutionContext {
  /** Variables injected by the trigger (e.g. %user%, %reward%) */
  vars: Record<string, string>;
  /** Global persistent variables that survive between executions */
  globalVars: Record<string, string>;
  /** The triggering live redemption item, if applicable */
  redemptionItem?: LiveRedemptionQueueItem;
  /** Reference to the parent action being executed */
  actionId: string;
  /** Whether execution should halt (set by 'break' sub-action) */
  shouldBreak: boolean;
  /** Execution log lines for the activity feed */
  log: string[];
}

// ─────────────────────────────────────────────
// TRIGGERS
// ─────────────────────────────────────────────

export type TriggerSource =
  | "twitch"
  | "kick"
  | "obs"
  | "hotkey"
  | "manual";

export type TwitchTriggerType =
  | "twitch_sub"
  | "twitch_resub"
  | "twitch_gift_sub"
  | "twitch_follow"
  | "twitch_reward"
  | "twitch_raid"
  | "twitch_cheer"
  | "twitch_command";

export type KickTriggerType =
  | "kick_follow"
  | "kick_sub"
  | "kick_gift_sub"
  | "kick_command";

export type ObsTriggerType =
  | "obs_scene_changed"
  | "obs_stream_started"
  | "obs_stream_stopped"
  | "obs_recording_started";

export type HotkeyTriggerType = "hotkey" | "manual";

export type TriggerType =
  | TwitchTriggerType
  | KickTriggerType
  | ObsTriggerType
  | HotkeyTriggerType;

export type SubscriptionTier = "prime" | "tier1" | "tier2" | "tier3";

export type ChatCommandRole =
  | "broadcaster"
  | "moderator"
  | "vip"
  | "subscriber"
  | "any";

export interface TriggerCriteria {
  // Twitch Sub / Resub / Gift Sub
  tiers?: SubscriptionTier[];
  minGiftCount?: number;
  maxGiftCount?: number;

  // Twitch Reward
  rewardTitle?: string;
  rewardId?: string; // empty string = wildcard

  // Twitch Raid
  minViewers?: number;

  // Twitch Cheer
  minBits?: number;

  // Twitch / Kick Command
  command?: string; // e.g. "!siren"
  commandRoles?: ChatCommandRole[];

  // OBS Scene Changed
  sceneName?: string;

  // Hotkey
  hotkey?: string; // e.g. "Ctrl+Shift+F1"
}

export interface AlertTrigger {
  id: string;
  type: TriggerType;
  source: TriggerSource;
  label: string; // human-readable e.g. "Twitch › Subscriptions › Tier 1/2/3"
  enabled: boolean;
  criteria: TriggerCriteria;
}

// ─────────────────────────────────────────────
// SUB-ACTIONS
// ─────────────────────────────────────────────

export type SubActionCategory =
  | "logic"
  | "platform"
  | "obs"
  | "overlay"
  | "external";

// ── Logic & Control Flow ──────────────────────

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "greater_than"
  | "less_than"
  | "contains"
  | "not_contains"
  | "regex";

export type MathOperation = "set" | "add" | "subtract" | "multiply" | "divide";

export interface SubActionIfElse {
  kind: "if_else";
  leftVar: string; // e.g. "%user%"
  operator: ConditionOperator;
  rightValue: string;
  thenSubActions: SubAction[];
  elseSubActions: SubAction[];
}

export interface SubActionSetVariable {
  kind: "set_variable";
  variableName: string; // e.g. "counter"
  value: string;
  operation: MathOperation;
  scope: "local" | "global";
}

export interface SubActionDelay {
  kind: "delay";
  delayMs: number;
}

export interface SubActionRunAction {
  kind: "run_action";
  targetActionId: string;
  targetActionName: string;
  mode: "sync" | "async";
}

export interface SubActionBreak {
  kind: "break";
}

export type SubActionLogic =
  | SubActionIfElse
  | SubActionSetVariable
  | SubActionDelay
  | SubActionRunAction
  | SubActionBreak;

// ── Platform (Twitch / Kick) ──────────────────

export interface SubActionTwitchTargetInfo {
  kind: "twitch_target_info";
  targetVar: string; // variable holding the username, e.g. "%user%"
}

export type RedemptionUpdateStatus = "fulfilled" | "canceled";

export interface SubActionTwitchUpdateReward {
  kind: "twitch_update_reward_status";
  status: RedemptionUpdateStatus;
}

export interface SubActionTwitchChatMessage {
  kind: "twitch_chat_message";
  platform: "twitch" | "kick";
  message: string; // supports %vars%
  replyToUser: boolean;
}

export interface SubActionTwitchCreateClip {
  kind: "twitch_create_clip";
  hasDelay: boolean; // adds ~2s delay before capture
  storeAs: string; // variable name to store clip URL
}

export interface SubActionTwitchTimeoutBan {
  kind: "twitch_timeout_ban";
  action: "timeout" | "ban";
  targetVar: string; // variable holding username
  durationSeconds?: number; // for timeout only
  reason: string;
}

export type SubActionPlatform =
  | SubActionTwitchTargetInfo
  | SubActionTwitchUpdateReward
  | SubActionTwitchChatMessage
  | SubActionTwitchCreateClip
  | SubActionTwitchTimeoutBan;

// ── OBS Studio ───────────────────────────────

export type ObsCanvas = "main" | "vertical" | "both";
export type VisibilityState = "visible" | "hidden" | "toggle";
export type ObsSceneTarget = "program" | "preview";

export interface SubActionObsSourceVisibility {
  kind: "obs_source_visibility";
  sceneName: string;
  sourceName: string;
  canvas: ObsCanvas;
  state: VisibilityState;
}

export interface SubActionObsSwitchScene {
  kind: "obs_switch_scene";
  sceneName: string;
  canvas: ObsCanvas;
  target: ObsSceneTarget;
}

export interface SubActionObsSetText {
  kind: "obs_set_text";
  sceneName: string;
  sourceName: string;
  text: string; // supports %vars%
}

export type MediaControlAction = "play" | "pause" | "restart" | "stop";

export interface SubActionObsMediaControl {
  kind: "obs_media_control";
  sourceName: string;
  action: MediaControlAction;
}

export type AudioControlMode = "volume_db" | "volume_mul" | "mute" | "unmute";

export interface SubActionObsAudioControl {
  kind: "obs_audio_control";
  sourceName: string;
  mode: AudioControlMode;
  value?: number; // dB or multiplier value (for volume modes)
}

export type SubActionObs =
  | SubActionObsSourceVisibility
  | SubActionObsSwitchScene
  | SubActionObsSetText
  | SubActionObsMediaControl
  | SubActionObsAudioControl;

// ── Audio & Visual Overlays ───────────────────

export type AudioTarget = "overlay" | "desktop";
export type VisualAnimation =
  | "none"
  | "bounce"
  | "zoom"
  | "fade"
  | "slide_top"
  | "slide_bottom"
  | "shake";

export type VisualPosition =
  | "top_left"
  | "top_center"
  | "top_right"
  | "center_left"
  | "center"
  | "center_right"
  | "bottom_left"
  | "bottom_center"
  | "bottom_right";

export interface SubActionPlayAudio {
  kind: "play_audio";
  src: string; // path or URL
  volume: number; // 0–100
  target: AudioTarget;
}

export interface SubActionDisplayVisual {
  kind: "display_visual";
  src: string; // path or URL (.gif, .webm, .png)
  durationMs: number;
  animation: VisualAnimation;
  position: VisualPosition;
  bannerText: string; // supports %vars%
  bannerEnabled: boolean;
}

export type SubActionOverlay = SubActionPlayAudio | SubActionDisplayVisual;

// ── External Webhooks ─────────────────────────

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export interface SubActionHttpRequest {
  kind: "http_request";
  method: HttpMethod;
  url: string; // supports %vars%
  headers: Record<string, string>;
  body: string; // JSON string, supports %vars%
  responseVar: string; // prefix for injected vars e.g. "http_result"
}

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface SubActionDiscordWebhook {
  kind: "discord_webhook";
  webhookUrl: string;
  title: string; // supports %vars%
  description: string; // supports %vars%
  color: string; // hex e.g. "#9146FF"
  authorName: string; // supports %vars%
  thumbnailUrl: string;
  fields: DiscordEmbedField[];
}

export type SubActionExternal =
  | SubActionHttpRequest
  | SubActionDiscordWebhook;

// ── Unified SubAction ─────────────────────────

export type SubActionOptions =
  | SubActionLogic
  | SubActionPlatform
  | SubActionObs
  | SubActionOverlay
  | SubActionExternal;

export type SubActionKind = SubActionOptions["kind"];

export interface SubAction {
  id: string;
  enabled: boolean;
  label?: string; // optional display override
  category: SubActionCategory;
  options: SubActionOptions;
}

// ─────────────────────────────────────────────
// ACTIONS & GROUPS
// ─────────────────────────────────────────────

export type QueueMode = "fifo" | "blocking" | "concurrent";

export type ActionGroup =
  | "Alerts"
  | "Redemptions"
  | "Soundboard"
  | "OBS Macros"
  | "Custom";

export interface AlertAction {
  id: string;
  name: string;
  group: ActionGroup;
  enabled: boolean;
  queueMode: QueueMode;
  triggers: AlertTrigger[];
  subActions: SubAction[];
  /** Tracks last execution timestamp */
  lastExecutedAt?: number;
  /** Cooldown in ms between executions (0 = no cooldown) */
  cooldownMs: number;
  createdAt: number;
  updatedAt: number;
}

// ─────────────────────────────────────────────
// LIVE REDEMPTION QUEUE
// ─────────────────────────────────────────────

export type RedemptionStatus =
  | "pending"
  | "executing"
  | "fulfilled"
  | "canceled"
  | "error";

export interface LiveRedemptionQueueItem {
  id: string;
  timestamp: number;
  user: string;
  rewardTitle: string;
  cost: number;
  platform: "twitch" | "kick" | "manual";
  status: RedemptionStatus;
  actionId?: string; // which action was/will be triggered
  redemptionId?: string; // platform redemption ID for fulfill/cancel API
  errorMessage?: string;
  contextVars: Record<string, string>;
}

// ─────────────────────────────────────────────
// SETTINGS STORE SLICE
// ─────────────────────────────────────────────

export interface AlertsSettings {
  actions: AlertAction[];
  globalVars: Record<string, string>;
  activityLog: LiveRedemptionQueueItem[];
  overlayEnabled: boolean;
  twitchApiToken: string; // OAuth token for Twitch API calls
  kickApiToken: string;
  discordWebhookDefault: string;
}

// ─────────────────────────────────────────────
// ENGINE EVENTS
// ─────────────────────────────────────────────

export interface EngineEvent {
  type: TriggerType | "manual";
  vars: Record<string, string>;
  redemptionId?: string;
  platform?: "twitch" | "kick" | "obs" | "manual";
}

// ─────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────

export interface SubActionMeta {
  kind: SubActionKind;
  label: string;
  description: string;
  category: SubActionCategory;
  icon: string;
  defaultOptions: SubActionOptions;
}

export interface TriggerMeta {
  type: TriggerType;
  source: TriggerSource;
  label: string;
  icon: string;
  defaultCriteria: TriggerCriteria;
}
