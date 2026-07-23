/**
 * Shared domain types for the Stream Control app.
 *
 * When you add a new platform (YouTube, TikTok, …) or a new module
 * (Alerts, OBS Dashboard, …), extend the relevant types here.
 */
import type { ReactNode } from "react";

/* ------------------------------------------------------------------ */
/*  Chat                                                              */
/* ------------------------------------------------------------------ */

/** A single chat message from any platform. */
export interface ChatMsg {
  id: string;
  platform: PlatformId;
  username: string;
  color?: string;
  badges: string[];
  parts: MessagePart[];
  timestamp: number;
  /** Platform-confirmed first message ever sent to this channel. */
  isFirstMessage?: boolean;
}

export type MessagePart =
  | { type: "text"; text: string }
  | { type: "emote"; url: string; name: string };

/** Live connection state for a platform connector. */
export type ConnStatus = "idle" | "connecting" | "connected" | "error";

/* ------------------------------------------------------------------ */
/*  Platforms                                                         */
/* ------------------------------------------------------------------ */

/**
 * Every platform we connect to is identified by one of these IDs.
 * Add a new value here when you add a new connector.
 */
export type PlatformId = "twitch" | "kick";

/**
 * A PlatformConnector owns a live connection to one platform's chat
 * (and, in future, its stream API, moderation API, etc.).
 *
 * Connectors are framework-agnostic: they extend {@link Emitter} and
 * expose typed `onMessage` / `onStatus` subscriptions. The React layer
 * in `hooks/useChat` subscribes to them and syncs to state.
 *
 * To add a new platform:
 *   1. Implement this interface (see `platforms/twitch.ts` for an example).
 *   2. Register it in `platforms/index.ts`.
 */
export interface PlatformConnector {
  readonly id: PlatformId;
  readonly name: string;
  readonly color: string;

  /** Start connecting to the given channel (slug / username / id). */
  connect(channel: string): void;

  /** Tear down the connection and release all listeners. */
  disconnect(): void;

  /** Subscribe to incoming chat messages. Returns an unsubscribe function. */
  onMessage(cb: (msg: ChatMsg) => void): () => void;

  /** Subscribe to connection status changes. Returns an unsubscribe function. */
  onStatus(cb: (status: ConnStatus, error?: string) => void): () => void;
}

/* ------------------------------------------------------------------ */
/*  Tabs                                                              */
/* ------------------------------------------------------------------ */

/**
 * A Tab is a top-level feature rendered inside the app shell
 * (e.g. "Chat", "OBS Dashboard", "Now Playing"). The shell's sidebar lists
 * every registered tab; clicking one renders its `Component`.
 *
 * To add a new tab:
 *   1. Create `modules/<name>.tsx` exporting a `Tab` object.
 *   2. Register it in `modules/index.ts`.
 */
export interface Tab {
  id: string;
  name: string;
  icon: ReactNode;
  description: string;
  Component: () => ReactNode;
}

export type Module = Tab;

/* ------------------------------------------------------------------ */
/*  Settings                                                          */
/* ------------------------------------------------------------------ */

/**
 * Persisted user settings. Each module owns a slice of this object.
 * When you add a module, add its settings here (with sensible defaults
 * in `lib/store.tsx`).
 */
export interface Settings {
  // Chat module
  twitchChannel: string;
  kickChannel: string;
  fontSize: number;
  showTimestamps: boolean;
  showPlatform: boolean;
  /** How many seconds a message stays visible in the OBS overlay. */
  chatTtl: number;
  /** Vertical anchor of the chat feed: "top" or "bottom". */
  chatAnchor: "top" | "bottom";
  /** Side messages slide in from: "left" or "right". */
  chatSlideFrom: "left" | "right";
  /** Font id from CHAT_FONTS in lib/chatStyle.ts. */
  chatFont: string;
  /** Usernames whose messages are hidden (comma/newline separated). */
  chatBlacklist: string;
  /** Highlight first-time chatters in the feed. */
  chatHighlightFirst: boolean;
  /** Highlight messages that @mention the broadcaster / highlight names. */
  chatHighlightMentions: boolean;
  /** Highlight messages from the streamer (channel name). */
  chatHighlightSelf: boolean;
  /** Prefer role-based name colors when the user has no color set. */
  chatRoleColors: boolean;
  /**
   * Extra names that count as "you" for mention/self highlights
   * (comma/newline). Channel names are always included automatically.
   */
  chatHighlightNames: string;
  /** Default platform filter for overlay/popout: all | twitch | kick */
  chatPlatformFilter: "all" | "twitch" | "kick";

  // Spotify module
  spotifyClientId: string;
  /**
   * Custom Spotify OAuth redirect URI. This is editable because some
   * users need a fixed callback like `http://127.0.0.1:8080/auth/spotify/callback`.
   */
  spotifyRedirectUri: string;
  /**
   * Spotify refresh token, saved after login so the Now Playing
   * browser-source URL can be copied from the app at any time
   * (same pattern as the chat overlay URL).
   */
  spotifyRefreshToken: string;
  /** "spotify-api" (requires Premium) or "local-player" (non-Premium title reader) */
  nowPlayingMode: "spotify-api" | "local-player";

  // OBS Dashboard module
  /** OBS WebSocket server host (default 127.0.0.1). */
  obsHost: string;
  /** OBS WebSocket server port (default 4455, OBS 28+). */
  obsPort: number;
  /** OBS WebSocket server password (left blank if OBS has no password set). */
  obsPassword: string;
  /** Automatically connect to OBS when the dashboard opens. */
  obsAutoConnect: boolean;
  /** Saved refresh rate for the live stream preview monitor. */
  obsPreviewFps: 15 | 30 | 60;
  /** Selected OBS scene or source name for the Vertical Stream Preview monitor. */
  obsVerticalPreviewSource: string;

  // App layout
  /** Order of tabs in the sidebar (array of tab IDs). */
  tabOrder: string[];
  moduleOrder?: string[];
  /** Global edit mode — when on, tabs/tiles/items can be dragged to reorder. */
  editMode: boolean;
  /** Whether the sidebar is collapsed to its minimized icon-only rail. */
  sidebarCollapsed: boolean;
  /** Whether the sidebar is docked on the right side of the screen (instead of left). */
  sidebarRight: boolean;
  /** Order of tiles inside the Chat tab. */
  chatTileOrder: string[];
  chatModuleOrder?: string[];
  /** Freeform x/y/w/h layout for Chat tiles. */
  chatBoardLayout: Record<string, { x: number; y: number; w: number; h?: number }>;
  /** Order of tiles inside the Now Playing tab. */
  spotifyTileOrder: string[];
  spotifyModuleOrder?: string[];
  /** Freeform x/y/w/h layout for Now Playing tiles. */
  spotifyBoardLayout: Record<string, { x: number; y: number; w: number; h?: number }>;
  /** Order of tiles inside the OBS Dashboard tab. */
  obsTileOrder: string[];
  obsModuleOrder?: string[];
  /** Freeform x/y/w/h layout for large OBS Dashboard tiles. */
  obsBoardLayout: Record<string, { x: number; y: number; w: number; h?: number }>;
  /** Fixed-grid order for Audience small tiles. */
  obsAudienceOrder: string[];
  /** Fixed-grid order for Performance small tiles. */
  obsPerformanceOrder: string[];
  /** Fixed-grid order for Status small tiles. */
  obsStatusOrder: string[];
  /** Custom ordering for SCENES pill bar and items when in edit mode. */
  obsScenesOrder: string[];
  obsSourcesOrder: string[];
  obsVScenesOrder: string[];
  obsVSourcesOrder: string[];
  /** Custom order for the Scenes & Sources view-switcher pills. */
  obsScenesSourcesTabOrder: string[];
  /** List of hidden items (`${type}:${nameOrId}`) from the Scenes & Sources dock. */
  obsHiddenItems: string[];
  /** Linked items across Main and Vertical canvases (`key -> linkedKeys[]`). */
  obsLinkedItems: Record<string, string[]>;
  /** Minimized/hidden top-level tiles on the OBS Dashboard board. */
  obsHiddenTiles: string[];
  /** Whether the OBS Dashboard chat preview is expanded. */
  obsChatPreviewOpen: boolean;
  /** Saved height of the resizable OBS Dashboard chat preview. */
  obsChatPreviewHeight: number;
  /** Freeform layout for Clips tab tiles. */
  clipsBoardLayout: Record<string, { x: number; y: number; w: number; h?: number }>;
  /** Order of Clips tab tiles. */
  clipsTileOrder: string[];
  clipsModuleOrder?: string[];
  /** Order of audio channels inside the OBS Audio Mixer tile. */
  obsAudioOrder: string[];

  // Go Live / production
  /** Scene to switch to when going live. */
  goLiveScene: string;
  /** Scene to switch to when ending stream. */
  goLiveEndScene: string;
  /** Start OBS streaming as part of Go Live. */
  goLiveStartStream: boolean;
  /** Start OBS recording as part of Go Live. */
  goLiveStartRecord: boolean;
  /** Stop OBS streaming as part of End Stream. */
  goLiveStopStream: boolean;
  /** Stop OBS recording as part of End Stream. */
  goLiveStopRecord: boolean;
  /** Enable Discord live webhooks when going live. */
  goLiveEnableWebhooks: boolean;
  /** Delay (ms) between sequential Go Live steps. */
  goLiveStepDelayMs: number;

  // streamer.bot bridge
  /** Shared secret required on bridge API requests (optional). */
  bridgeApiKey: string;
  /** Accept bridge actions without a key (local-only convenience). */
  bridgeAllowUnauthed: boolean;

  // Clips module
  /** Twitch app Client ID used for clips OAuth + Helix. */
  twitchClipsClientId: string;
  /** OAuth redirect URI registered on the Twitch app. */
  twitchClipsRedirectUri: string;
  /** Last known refresh token (mirrored for convenience; primary store is localStorage). */
  twitchClipsRefreshToken: string;
  /** Connected Twitch login for clips. */
  twitchClipsUserLogin: string;
  /** Pass has_delay=true when creating clips. */
  clipsHasDelay: boolean;
  /** Optional Discord webhook for sharing new clips. */
  clipsDiscordWebhookUrl: string;
  /** Custom template message when sharing clips to Discord (supports {title} and {url}). */
  clipsDiscordMessage: string;
  /** Auto-post successfully created Twitch clips to Discord. */
  clipsAutoPostDiscord: boolean;
  /** Global hotkey combo (e.g. "Ctrl+Shift+M") for Mark moment. Empty = unset. */
  momentHotkey: string;
  /** Global hotkey combo for Create Twitch clip. Empty = unset. */
  clipHotkey: string;
  /** Global hotkey combo for Save OBS replay. Empty = unset. */
  replayHotkey: string;

  // Alerts & Redemptions Engine (streamer.bot in-app replacement)
  alerts: import("./types/alerts").AlertsSettings;
  alertActions: import("./types/alerts").AlertAction[];
  alertBoardLayout: Record<string, { x: number; y: number; w: number; h?: number }>;
  alertTileOrder: string[];
  alertModuleOrder?: string[];
  alertsTwitchUserLogin?: string;
  alertsTwitchAccessToken?: string;
}

export * from "./types/alerts";
