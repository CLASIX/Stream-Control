/**
 * APIs injected by the Electron preload script (electron/preload.cjs).
 * Only present when running inside the desktop app — always feature-check
 * before use so the web/dev build keeps working.
 */
interface StreamControlBridge {
  isDesktop: boolean;
  /** Open the chat reader as a native, resizable, always-on-top window. */
  openPopout: (url: string) => Promise<boolean>;
  closePopout?: () => Promise<boolean>;
  isPopoutOpen?: () => Promise<boolean>;
  onPopoutStatus?: (callback: (isOpen: boolean) => void) => () => void;
  hotkeys?: {
    configure: (bindings: Array<{ accelerator: string; action: string }>) => Promise<boolean>;
  };
  webhooks: {
    list: () => Promise<LiveWebhook[]>;
    save: (config: Partial<LiveWebhook>) => Promise<LiveWebhook>;
    delete: (id: string) => Promise<boolean>;
    test: (config: Partial<LiveWebhook>) => Promise<WebhookActionResult>;
    check: (id: string) => Promise<WebhookActionResult>;
    previewProfile: (input: {
      platform?: "twitch" | "kick";
      channel?: string;
    }) => Promise<WebhookProfileResult>;
    onUpdated: (callback: (configs: LiveWebhook[]) => void) => () => void;
  };
  bridge?: {
    setConfig: (cfg: {
      apiKey?: string;
      allowUnauthed?: boolean;
    }) => Promise<boolean>;
    getConfig: () => Promise<{ apiKey: string; allowUnauthed: boolean }>;
    onAction: (
      handler: (request: {
        action: string;
        params?: Record<string, unknown>;
      }) => Promise<{ ok: boolean; result?: unknown; error?: string }> | {
        ok: boolean;
        result?: unknown;
        error?: string;
      }
    ) => () => void;
  };
}

interface WebhookActionResult {
  ok: boolean;
  message?: string;
}

interface WebhookProfileResult {
  ok: boolean;
  message?: string;
  profile?: {
    displayName: string;
    login: string;
    profileImage: string;
    bannerImage: string;
    description: string;
    url: string;
    live: boolean;
    title?: string;
    game?: string;
  };
}

interface LiveWebhookStatus {
  state: "idle" | "disabled" | "checking" | "offline" | "live" | "sent" | "error";
  message: string;
  lastCheckedAt?: string;
  lastSentAt?: string;
  title?: string;
}

interface LiveWebhook {
  id: string;
  type: "discord-live";
  name: string;
  enabled: boolean;
  platform: "twitch" | "kick";
  channel: string;
  discordWebhookUrl: string;

  /** Message content above the embed. Supports template variables. */
  message: string;
  /** Allow @everyone / role / user mentions in content. */
  mentionEveryone?: boolean;

  /**
   * Discord webhook display name — the username that posts the message.
   * Empty = channel display name.
   */
  botUsername?: string;
  /**
   * Discord webhook avatar URL — the profile icon that posts the message.
   * Empty = channel profile picture.
   */
  botAvatarUrl?: string;

  /** When false, only the plain message is sent (no embed card). */
  useEmbed?: boolean;
  embedTitle?: string;
  embedDescription?: string;
  /** Author line above the embed title (e.g. "{channel} · {platform}"). */
  embedAuthor?: string;
  embedFooter?: string;
  /** Hex color e.g. #9146FF */
  embedColor?: string;

  /** Custom labels for embed fields (supports template variables). */
  gameFieldLabel?: string;
  viewersFieldLabel?: string;
  watchFieldLabel?: string;
  watchFieldValue?: string;

  showProfileImage?: boolean;
  showBanner?: boolean;
  showStreamPreview?: boolean;
  showGame?: boolean;
  showViewers?: boolean;
  showTimestamp?: boolean;
  showWatchLink?: boolean;

  createdAt?: string;
  lastAnnouncedStreamId?: string;
  lastSentAt?: string;
  status?: LiveWebhookStatus;
}

interface Window {
  streamControl?: StreamControlBridge;
}
