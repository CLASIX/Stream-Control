/**
 * App-wide settings store.
 *
 * - Persists to localStorage under a versioned key (`multichat:settings:v1`).
 *   Bump the version (and write a migration) if you change the shape.
 * - Every module reads/writes its slice via `useStore()`.
 * - URL params (used by the OBS overlay) take precedence over the store;
 *   see `components/ChatOverlay.tsx`.
 */
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { Settings } from "../types";
import {
  createPreset,
  loadPresets,
  savePresets,
  type Preset,
} from "./presets";
import { DEFAULT_ACTIONS } from "./alertEngine";

const STORAGE_KEY = "multichat:settings:v1";

/** Defaults applied when there is nothing persisted yet. */
export const DEFAULT_SETTINGS: Settings = {
  twitchChannel: "",
  kickChannel: "",
  fontSize: 16,
  showTimestamps: false,
  showPlatform: true,
  chatTtl: 7,
  chatAnchor: "top",
  chatSlideFrom: "left",
  chatFont: "default",
  chatBlacklist: "",
  chatHighlightFirst: true,
  chatHighlightMentions: true,
  chatHighlightSelf: true,
  chatRoleColors: true,
  chatHighlightNames: "",
  chatPlatformFilter: "all",
  spotifyClientId: "",
  spotifyRedirectUri: "",
  spotifyRefreshToken: "",
  nowPlayingMode: "local-player",
  obsHost: "127.0.0.1",
  obsPort: 4455,
  obsPassword: "",
  obsAutoConnect: false,
  obsPreviewFps: 30,
  obsVerticalPreviewSource: "",
  tabOrder: ["obs", "alerts", "chat", "spotify", "clips", "webhooks", "settings"],
  moduleOrder: ["obs", "alerts", "chat", "spotify", "clips", "webhooks", "settings"],
  alerts: {
    actions: DEFAULT_ACTIONS as any,
    globalVars: {},
    activityLog: [],
    overlayEnabled: true,
    twitchApiToken: "",
    kickApiToken: "",
    discordWebhookDefault: "",
  },
  alertActions: DEFAULT_ACTIONS as any,
  alertBoardLayout: {
    actionsWorkspace: { x: 0, y: 0, w: 1000, h: 660 },
    activityQueue: { x: 1020, y: 0, w: 420, h: 660 },
    overlayConnect: { x: 0, y: 680, w: 720, h: 280 },
    twitchConnection: { x: 740, y: 680, w: 720, h: 280 },
  },
  alertTileOrder: ["actionsWorkspace", "activityQueue", "overlayConnect", "twitchConnection"],
  editMode: false,
  sidebarCollapsed: false,
  sidebarRight: false,
  chatTileOrder: [
    "channels",
    "blockedUsers",
    "highlights",
    "orientation",
    "appearance",
    "obsSource",
    "popout",
  ],
  chatModuleOrder: [
    "channels",
    "blockedUsers",
    "highlights",
    "orientation",
    "appearance",
    "obsSource",
    "popout",
  ],
  chatBoardLayout: {
    channels: { x: 720, y: 450, w: 360 },
    highlights: { x: 760, y: 20, w: 360 },
    orientation: { x: 0, y: 20, w: 360 },
    appearance: { x: 380, y: 20, w: 360 },
    obsSource: { x: 0, y: 300, w: 360 },
    popout: { x: 380, y: 420, w: 360 },
    blockedUsers: { x: 760, y: 480, w: 360 },
  },
  spotifyTileOrder: ["connection", "obsSource", "livePreview"],
  spotifyModuleOrder: ["connection", "obsSource", "livePreview"],
  spotifyBoardLayout: {
    connection: { x: 0, y: 290, w: 360 },
    obsSource: { x: 0, y: 10, w: 360 },
    livePreview: { x: 380, y: 220, w: 540 },
  },
  obsTileOrder: [
    "preview",
    "verticalPreview",
    "chatPreview",
    "scenesSources",
    "connection",
    "status",
    "audience",
    "performance",
  ],
  obsModuleOrder: [
    "preview",
    "verticalPreview",
    "chatPreview",
    "scenesSources",
    "connection",
    "status",
    "audience",
    "performance",
  ],
  obsBoardLayout: {
    preview: { x: 440, y: 20, w: 1000 },
    verticalPreview: { x: 1460, y: 440, w: 400, h: 720 },
    chatPreview: { x: 0, y: 20, w: 420 },
    scenesSources: { x: 0, y: 420, w: 380, h: 460 },
    connection: { x: 1460, y: 20, w: 260 },
    status: { x: 1460, y: 160, w: 260 },
    audience: { x: 0, y: 760, w: 720 },
    performance: { x: 0, y: 860, w: 640 },
  },
  obsAudienceOrder: ["twitch", "total", "kick", "uptime"],
  obsPerformanceOrder: ["cpu", "fps", "dropped", "render"],
  obsStatusOrder: ["stream", "record", "vcam"],
  obsScenesOrder: [],
  obsSourcesOrder: [],
  obsVScenesOrder: [],
  obsVSourcesOrder: [],
  obsScenesSourcesTabOrder: ["scenes", "sources", "vScenes", "vSources"],
  obsHiddenItems: [],
  obsLinkedItems: {},
  obsHiddenTiles: [],
  obsChatPreviewOpen: false,
  obsChatPreviewHeight: 360,
  clipsBoardLayout: {
    actions: { x: 0, y: 20, w: 380 },
    moments: { x: 400, y: 20, w: 380 },
    connection: { x: 0, y: 420, w: 380 },
    discord: { x: 1200, y: 20, w: 380 },
    recent: { x: 800, y: 20, w: 380 },
  },
  clipsTileOrder: ["actions", "moments", "connection", "discord", "recent"],
  clipsModuleOrder: ["actions", "moments", "connection", "discord", "recent"],
  obsAudioOrder: [],
  goLiveScene: "",
  goLiveEndScene: "",
  goLiveStartStream: true,
  goLiveStartRecord: false,
  goLiveStopStream: true,
  goLiveStopRecord: true,
  goLiveEnableWebhooks: true,
  goLiveStepDelayMs: 400,
  bridgeApiKey: "",
  bridgeAllowUnauthed: true,
  twitchClipsClientId: "",
  twitchClipsRedirectUri: "",
  twitchClipsRefreshToken: "",
  twitchClipsUserLogin: "",
  clipsHasDelay: false,
  clipsDiscordWebhookUrl: "",
  clipsDiscordMessage: "@everyone Check out this new stream clip: {title}\n{url}",
  clipsAutoPostDiscord: false,
  momentHotkey: "",
  clipHotkey: "",
  replayHotkey: "",
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const saved = JSON.parse(raw) as Partial<Settings>;
    const settings = { ...DEFAULT_SETTINGS, ...saved };

    settings.tabOrder = saved.tabOrder ?? saved.moduleOrder ?? DEFAULT_SETTINGS.tabOrder;
    settings.moduleOrder = settings.tabOrder;
    settings.obsTileOrder = saved.obsTileOrder ?? saved.obsModuleOrder ?? DEFAULT_SETTINGS.obsTileOrder;
    settings.obsModuleOrder = settings.obsTileOrder;
    settings.chatTileOrder = saved.chatTileOrder ?? saved.chatModuleOrder ?? DEFAULT_SETTINGS.chatTileOrder;
    settings.chatModuleOrder = settings.chatTileOrder;
    settings.spotifyTileOrder = saved.spotifyTileOrder ?? saved.spotifyModuleOrder ?? DEFAULT_SETTINGS.spotifyTileOrder;
    settings.spotifyModuleOrder = settings.spotifyTileOrder;
    settings.clipsTileOrder = saved.clipsTileOrder ?? saved.clipsModuleOrder ?? DEFAULT_SETTINGS.clipsTileOrder;
    settings.clipsModuleOrder = settings.clipsTileOrder;

    if (!Array.isArray(settings.obsScenesOrder)) settings.obsScenesOrder = [];
    if (!Array.isArray(settings.obsSourcesOrder)) settings.obsSourcesOrder = [];
    if (!Array.isArray(settings.obsVScenesOrder)) settings.obsVScenesOrder = [];
    if (!Array.isArray(settings.obsVSourcesOrder)) settings.obsVSourcesOrder = [];
    if (!Array.isArray(settings.obsScenesSourcesTabOrder) || settings.obsScenesSourcesTabOrder.length === 0) {
      settings.obsScenesSourcesTabOrder = [...DEFAULT_SETTINGS.obsScenesSourcesTabOrder];
    }
    if (!Array.isArray(settings.obsHiddenItems)) settings.obsHiddenItems = [];
    if (!settings.obsLinkedItems || typeof settings.obsLinkedItems !== "object") settings.obsLinkedItems = {};
    if (!Array.isArray(settings.obsHiddenTiles)) settings.obsHiddenTiles = [];

    if (!settings.alerts || typeof settings.alerts !== "object") {
      settings.alerts = {
        actions: (Array.isArray(settings.alertActions) && settings.alertActions.length > 0 ? settings.alertActions : DEFAULT_ACTIONS) as any,
        globalVars: {},
        activityLog: [],
        overlayEnabled: true,
        twitchApiToken: "",
        kickApiToken: "",
        discordWebhookDefault: "",
      };
    } else if (!Array.isArray(settings.alerts.actions) || settings.alerts.actions.length === 0) {
      settings.alerts.actions = DEFAULT_ACTIONS as any;
    }
    if (!Array.isArray(settings.alertActions) || settings.alertActions.length === 0) {
      settings.alertActions = settings.alerts.actions as any;
    }
    if (!settings.alertBoardLayout || typeof settings.alertBoardLayout !== "object") {
      settings.alertBoardLayout = { ...DEFAULT_SETTINGS.alertBoardLayout };
    }
    if (!Array.isArray(settings.alertTileOrder) || settings.alertTileOrder.length === 0) {
      settings.alertTileOrder = [...DEFAULT_SETTINGS.alertTileOrder];
    }

    // Migrate sidebar order: drop legacy "go-live"/"bridge" and ensure "obs" and "alerts" exist
    if (Array.isArray(settings.moduleOrder)) {
      const order = settings.moduleOrder
        .map((id) => (id === "go-live" ? "obs" : id === "bridge" ? "alerts" : id))
        .filter((id, i, arr) => arr.indexOf(id) === i);
      if (!order.includes("obs")) order.unshift("obs");
      if (!order.includes("alerts")) {
        const obsIdx = order.indexOf("obs");
        order.splice(obsIdx >= 0 ? obsIdx + 1 : 1, 0, "alerts");
      }
      if (!order.includes("clips")) {
        const chatIdx = order.indexOf("chat");
        order.splice(chatIdx >= 0 ? chatIdx + 1 : order.length, 0, "clips");
      }
      if (!order.includes("settings")) order.push("settings");
      settings.moduleOrder = order;
      settings.tabOrder = order;
    }

    // Ensure OBS freeform section order includes preview and chat preview, removing old tiles
    if (Array.isArray(settings.obsModuleOrder)) {
      const oo = [...settings.obsModuleOrder].filter(
        (id) => id !== "production" && id !== "steps" && id !== "settings" && id !== "actions"
      );
      if (!oo.includes("preview")) {
        const statusIdx = oo.indexOf("status");
        oo.splice(statusIdx >= 0 ? statusIdx + 1 : 0, 0, "preview");
      }
      if (!oo.includes("chatPreview")) {
        const previewIdx = oo.indexOf("preview");
        const statusIdx = oo.indexOf("status");
        const insertIdx = previewIdx >= 0 ? previewIdx + 1 : statusIdx >= 0 ? statusIdx + 1 : 0;
        oo.splice(insertIdx, 0, "chatPreview");
      }
      if (!oo.includes("scenesSources")) {
        const insertIdx = oo.indexOf("chatPreview");
        oo.splice(insertIdx >= 0 ? insertIdx + 1 : oo.length, 0, "scenesSources");
      }
      if (!oo.includes("verticalPreview")) {
        const insertIdx = oo.indexOf("preview");
        oo.splice(insertIdx >= 0 ? insertIdx + 1 : oo.length, 0, "verticalPreview");
      }
      settings.obsModuleOrder = oo;
      settings.obsTileOrder = oo;
    }

    if (settings.obsBoardLayout && !settings.obsBoardLayout.verticalPreview) {
      settings.obsBoardLayout.verticalPreview = { x: 1460, y: 440, w: 400, h: 720 };
    }

    if (settings.obsPreviewFps !== 15 && settings.obsPreviewFps !== 30 && settings.obsPreviewFps !== 60) {
      settings.obsPreviewFps = 30;
    }

    if (Array.isArray(settings.spotifyModuleOrder)) {
      const so = [...settings.spotifyModuleOrder];
      if (!so.includes("livePreview")) so.push("livePreview");
      settings.spotifyModuleOrder = so;
    }

    if (!settings.obsBoardLayout || Object.keys(settings.obsBoardLayout).length === 0) {
      settings.obsBoardLayout = { ...DEFAULT_SETTINGS.obsBoardLayout };
    } else if (settings.obsBoardLayout.scenesSources && !settings.obsBoardLayout.scenesSources.h) {
      settings.obsBoardLayout.scenesSources.h = 460;
    }
    if (!settings.chatBoardLayout || Object.keys(settings.chatBoardLayout).length === 0) {
      settings.chatBoardLayout = { ...DEFAULT_SETTINGS.chatBoardLayout };
    }
    if (!settings.spotifyBoardLayout || Object.keys(settings.spotifyBoardLayout).length === 0) {
      settings.spotifyBoardLayout = { ...DEFAULT_SETTINGS.spotifyBoardLayout };
    }
    if (!settings.clipsBoardLayout || Object.keys(settings.clipsBoardLayout).length === 0) {
      settings.clipsBoardLayout = { ...DEFAULT_SETTINGS.clipsBoardLayout };
    }

    return settings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable (private mode, etc.) — ignore */
  }
}

interface StoreValue {
  settings: Settings;
  /** Merge a partial patch into settings and persist. */
  update: (patch: Partial<Settings>) => void;

  /** Saved layout presets. */
  presets: Preset[];
  /** Save the current appearance/layout as a named preset. */
  saveCurrentAsPreset: (name: string) => void;
  /** Apply a preset's fields onto the live settings. */
  applyPreset: (id: string) => void;
  /** Delete a preset by id. */
  deletePreset: (id: string) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [presets, setPresets] = useState<Preset[]>(loadPresets);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const saveCurrentAsPreset = useCallback(
    (name: string) => {
      setSettings((current) => {
        setPresets((prev) => {
          const next = [...prev, createPreset(name, current)];
          savePresets(next);
          return next;
        });
        return current;
      });
    },
    []
  );

  const applyPreset = useCallback((id: string) => {
    setPresets((prev) => {
      const preset = prev.find((p) => p.id === id);
      if (preset) {
        setSettings((current) => {
          const next = { ...current, ...preset.data };
          saveSettings(next);
          return next;
        });
      }
      return prev;
    });
  }, []);

  const deletePreset = useCallback((id: string) => {
    setPresets((prev) => {
      const next = prev.filter((p) => p.id !== id);
      savePresets(next);
      return next;
    });
  }, []);

  return (
    <StoreContext.Provider
      value={{
        settings,
        update,
        presets,
        saveCurrentAsPreset,
        applyPreset,
        deletePreset,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

/** Read and update the global settings. Must be used inside `<StoreProvider>`. */
export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore() must be used within <StoreProvider>");
  return ctx;
}
