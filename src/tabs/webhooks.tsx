import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Tab } from "../types";

const DEFAULT_MESSAGE = "@everyone {channel} is now live on {platform}!";
const DEFAULT_EMBED_TITLE = "🔴 {channel} is LIVE";
const DEFAULT_EMBED_DESCRIPTION = "{title}";
const DEFAULT_EMBED_AUTHOR = "{channel} · {platform}";
const DEFAULT_EMBED_FOOTER = "Stream Control · {platform}";
const DEFAULT_GAME_FIELD_LABEL = "📂 Category";
const DEFAULT_VIEWERS_FIELD_LABEL = "👀 Viewers";
const DEFAULT_WATCH_FIELD_LABEL = "🔗 Watch";
const DEFAULT_WATCH_FIELD_VALUE = "Open on {platform}";

const TEMPLATE_HINT =
  "{channel}  {platform}  {title}  {game}  {url}  {viewers}  {login}";

function WebhookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
      <path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" />
    </svg>
  );
}

function emptyWebhook(): Partial<LiveWebhook> {
  return {
    type: "discord-live",
    name: "Live announcement",
    enabled: true,
    platform: "twitch",
    channel: "",
    discordWebhookUrl: "",
    message: DEFAULT_MESSAGE,
    mentionEveryone: true,
    botUsername: "",
    botAvatarUrl: "",
    useEmbed: true,
    embedTitle: DEFAULT_EMBED_TITLE,
    embedDescription: DEFAULT_EMBED_DESCRIPTION,
    embedAuthor: DEFAULT_EMBED_AUTHOR,
    embedFooter: DEFAULT_EMBED_FOOTER,
    embedColor: "#9146FF",
    gameFieldLabel: DEFAULT_GAME_FIELD_LABEL,
    viewersFieldLabel: DEFAULT_VIEWERS_FIELD_LABEL,
    watchFieldLabel: DEFAULT_WATCH_FIELD_LABEL,
    watchFieldValue: DEFAULT_WATCH_FIELD_VALUE,
    showProfileImage: true,
    showBanner: true,
    showStreamPreview: false,
    showGame: true,
    showViewers: false,
    showWatchLink: true,
    showTimestamp: true,
  };
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  let out = template || "";
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{${key}}`).join(value);
  }
  return out;
}

const STATUS_STYLES: Record<
  string,
  { label: string; className: string; dot: string }
> = {
  idle: {
    label: "Waiting",
    className: "bg-white/5 text-white/55 border-white/10",
    dot: "bg-slate-400",
  },
  disabled: {
    label: "Disabled",
    className: "bg-white/5 text-white/40 border-white/10",
    dot: "bg-slate-600",
  },
  checking: {
    label: "Checking",
    className: "bg-amber-500/10 text-amber-200 border-amber-400/20",
    dot: "bg-amber-400 animate-pulse",
  },
  offline: {
    label: "Offline",
    className: "bg-white/5 text-white/50 border-white/10",
    dot: "bg-slate-400",
  },
  live: {
    label: "Live",
    className: "bg-emerald-500/10 text-emerald-200 border-emerald-400/20",
    dot: "bg-emerald-400",
  },
  sent: {
    label: "Announced",
    className: "bg-[#5865F2]/15 text-[#b5bcff] border-[#5865F2]/30",
    dot: "bg-[#5865F2]",
  },
  error: {
    label: "Error",
    className: "bg-red-500/10 text-red-200 border-red-400/20",
    dot: "bg-red-500",
  },
};

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="border-b border-white/8 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">
      {children}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/8 bg-black/20 px-3 py-2.5 hover:border-white/15">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[#5865F2]"
      />
      <span className="min-w-0">
        <span className="block text-xs font-medium text-white/80">{label}</span>
        {hint && <span className="mt-0.5 block text-[10px] text-white/35">{hint}</span>}
      </span>
    </label>
  );
}

function Field({
  label,
  children,
  hint,
  badge,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  badge?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-2">
        <span className="text-xs font-semibold text-white/80">{label}</span>
        {badge && (
          <span className="rounded-full bg-[#5865F2]/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#b8c0ff]">
            {badge}
          </span>
        )}
      </span>
      {children}
      {hint && (
        <span className="mt-1.5 block text-[10px] leading-relaxed text-white/35">{hint}</span>
      )}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-white/25 focus:border-[#5865F2] focus:bg-black/50";

/** Live Discord-style embed preview */
function EmbedPreview({
  config,
  profile,
}: {
  config: Partial<LiveWebhook>;
  profile: WebhookProfileResult["profile"] | null;
}) {
  const platformName = config.platform === "kick" ? "Kick" : "Twitch";
  const displayName = profile?.displayName || config.channel || "YourChannel";
  const vars = {
    channel: displayName,
    platform: platformName,
    title: profile?.title || "My awesome stream title",
    game: profile?.game || "Just Chatting",
    url:
      profile?.url ||
      (config.platform === "kick"
        ? `https://kick.com/${config.channel || "you"}`
        : `https://twitch.tv/${config.channel || "you"}`),
    viewers: "128",
    login: profile?.login || config.channel || "you",
  };

  const content = applyTemplate(config.message ?? DEFAULT_MESSAGE, vars);
  const title = applyTemplate(config.embedTitle ?? DEFAULT_EMBED_TITLE, vars);
  const description = applyTemplate(
    config.embedDescription ?? DEFAULT_EMBED_DESCRIPTION,
    vars
  );
  const author = applyTemplate(config.embedAuthor ?? DEFAULT_EMBED_AUTHOR, vars);
  const footer = applyTemplate(config.embedFooter ?? DEFAULT_EMBED_FOOTER, vars);
  const gameLabel = applyTemplate(
    config.gameFieldLabel ?? DEFAULT_GAME_FIELD_LABEL,
    vars
  );
  const viewersLabel = applyTemplate(
    config.viewersFieldLabel ?? DEFAULT_VIEWERS_FIELD_LABEL,
    vars
  );
  const watchLabel = applyTemplate(
    config.watchFieldLabel ?? DEFAULT_WATCH_FIELD_LABEL,
    vars
  );
  const watchValue = applyTemplate(
    config.watchFieldValue ?? DEFAULT_WATCH_FIELD_VALUE,
    vars
  );
  const color =
    config.embedColor || (config.platform === "kick" ? "#53FC18" : "#9146FF");
  const avatar = (config.botAvatarUrl || "").trim() || profile?.profileImage || "";
  const botName =
    (config.botUsername || "").trim() || displayName || "Stream Control";
  const profileImg = profile?.profileImage || "";
  const bannerImg = profile?.bannerImage || "";
  const useEmbed = config.useEmbed !== false;

  return (
    <div className="rounded-xl border border-white/10 bg-[#313338] p-3 shadow-inner">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/35">
        Discord preview
        {profile?.live && (
          <span className="rounded-full bg-red-500/20 px-1.5 py-0.5 text-[9px] text-red-300 normal-case tracking-normal">
            channel is live
          </span>
        )}
      </div>

      <div className="flex gap-3">
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[#5865F2]/40 ring-2 ring-white/5">
          {avatar ? (
            <img src={avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs font-bold text-white/70">
              SC
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-semibold text-white">{botName}</span>
            <span className="rounded bg-[#5865F2] px-1 py-px text-[9px] font-bold uppercase text-white">
              App
            </span>
            <span className="text-[10px] text-white/35">Today at 7:00 PM</span>
          </div>

          {content && (
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-snug text-[#dbdee1]">
              {content}
            </p>
          )}

          {useEmbed && (
            <div
              className="mt-2 overflow-hidden rounded-r-md rounded-l-sm bg-[#2b2d31]"
              style={{ borderLeft: `4px solid ${color}` }}
            >
              <div className="p-3">
                {config.showProfileImage !== false && (author || profileImg) && (
                  <div className="mb-2 flex items-center gap-2">
                    {profileImg && (
                      <img
                        src={profileImg}
                        alt=""
                        className="h-5 w-5 rounded-full object-cover"
                      />
                    )}
                    <span className="text-xs font-semibold text-[#00a8fc]">
                      {author || displayName}
                    </span>
                  </div>
                )}

                <div className="flex gap-3">
                  <div className="min-w-0 flex-1">
                    {title && (
                      <div className="text-sm font-semibold leading-snug text-[#00a8fc]">
                        {title}
                      </div>
                    )}
                    {description && (
                      <p className="mt-1 text-[13px] leading-snug text-[#dbdee1]">
                        {description}
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      {config.showGame !== false && (
                        <div>
                          <div className="text-[10px] font-bold uppercase text-white/45">
                            {gameLabel}
                          </div>
                          <div className="text-xs text-[#dbdee1]">{vars.game}</div>
                        </div>
                      )}
                      {config.showViewers && (
                        <div>
                          <div className="text-[10px] font-bold uppercase text-white/45">
                            {viewersLabel}
                          </div>
                          <div className="text-xs text-[#dbdee1]">{vars.viewers}</div>
                        </div>
                      )}
                      {config.showWatchLink !== false && (
                        <div>
                          <div className="text-[10px] font-bold uppercase text-white/45">
                            {watchLabel}
                          </div>
                          <div className="text-xs text-[#00a8fc]">{watchValue}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {config.showProfileImage !== false && profileImg && (
                    <img
                      src={profileImg}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded-md object-cover"
                    />
                  )}
                </div>

                {config.showBanner !== false && bannerImg && (
                  <img
                    src={bannerImg}
                    alt=""
                    className="mt-3 w-full rounded-md object-cover"
                    style={{ maxHeight: 120 }}
                  />
                )}
                {config.showBanner !== false && !bannerImg && (
                  <div className="mt-3 flex h-16 items-center justify-center rounded-md border border-dashed border-white/10 bg-black/20 text-[10px] text-white/30">
                    Banner loads from your {platformName} channel
                  </div>
                )}

                {footer && (
                  <div className="mt-2 flex items-center gap-1.5 text-[10px] text-white/40">
                    {config.showProfileImage !== false && profileImg && (
                      <img
                        src={profileImg}
                        alt=""
                        className="h-3.5 w-3.5 rounded-full"
                      />
                    )}
                    {footer}
                    {config.showTimestamp !== false && " · Today at 7:00 PM"}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WebhooksModule() {
  const api = window.streamControl?.webhooks;
  const [webhooks, setWebhooks] = useState<LiveWebhook[]>([]);
  const [editing, setEditing] = useState<Partial<LiveWebhook> | null>(null);
  const [showUrl, setShowUrl] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [profile, setProfile] = useState<WebhookProfileResult["profile"] | null>(
    null
  );
  const [profileLoading, setProfileLoading] = useState(false);
  const [editorTab, setEditorTab] = useState<
    "basics" | "sender" | "text" | "style"
  >("basics");

  useEffect(() => {
    if (!api) return;
    void api.list().then(setWebhooks);
    return api.onUpdated(setWebhooks);
  }, [api]);

  useEffect(() => {
    if (!api || !editing?.channel?.trim()) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setProfileLoading(true);
      void api
        .previewProfile({
          platform: editing.platform || "twitch",
          channel: editing.channel,
        })
        .then((result) => {
          if (cancelled) return;
          if (result.ok && result.profile) setProfile(result.profile);
          else setProfile(null);
        })
        .finally(() => {
          if (!cancelled) setProfileLoading(false);
        });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, editing?.channel, editing?.platform]);

  const enabledCount = useMemo(
    () => webhooks.filter((item) => item.enabled).length,
    [webhooks]
  );

  const save = async () => {
    if (!api || !editing) return;
    if (!editing.name?.trim() || !editing.channel?.trim()) {
      setNotice({ kind: "error", text: "Enter a name and streaming channel." });
      return;
    }
    if (!editing.discordWebhookUrl?.includes("/api/webhooks/")) {
      setNotice({ kind: "error", text: "Enter a valid Discord webhook URL." });
      return;
    }

    setBusy(true);
    try {
      await api.save(editing);
      setEditing(null);
      setShowUrl(false);
      setNotice({
        kind: "success",
        text: "Saved. Stream Control will check this channel every minute while the app is open.",
      });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const test = async (config: Partial<LiveWebhook>) => {
    if (!api) return;
    setBusy(true);
    const result = await api.test(config);
    setNotice({
      kind: result.ok ? "success" : "error",
      text: result.message || "Test finished",
    });
    setBusy(false);
  };

  const triggerNow = async (config: LiveWebhook | Partial<LiveWebhook>) => {
    if (!api) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await api.test({
        ...config,
        embedTitle: config.embedTitle || "🔴 LIVE NOW",
      });
      setNotice({
        kind: result.ok ? "success" : "error",
        text: result.ok ? "Announcement posted immediately to Discord!" : (result.message || "Failed to trigger"),
      });
    } catch (e) {
      setNotice({
        kind: "error",
        text: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!api || !window.confirm("Delete this webhook automation?")) return;
    await api.delete(id);
    if (editing?.id === id) setEditing(null);
  };

  const toggle = async (config: LiveWebhook) => {
    if (!api) return;
    await api.save({ ...config, enabled: !config.enabled });
  };

  const patch = (partial: Partial<LiveWebhook>) => {
    setEditing((prev) => (prev ? { ...prev, ...partial } : prev));
  };

  const useTwitchAvatar = () => {
    if (profile?.profileImage) patch({ botAvatarUrl: profile.profileImage });
  };

  if (!api) {
    return (
      <div className="max-w-3xl">
        <header className="mb-4">
          <h2 className="text-2xl font-bold">Webhooks</h2>
          <p className="mt-1 text-sm text-white/50">
            Desktop stream automations for Discord and more.
          </p>
        </header>
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-5 text-sm text-amber-100/80">
          Webhook monitoring only runs in the desktop app. Open Stream Control with the EXE or
          Launch BAT to configure live announcements.
        </div>
      </div>
    );
  }

  const resolvedBotName =
    (editing?.botUsername || "").trim() ||
    profile?.displayName ||
    editing?.channel ||
    "Your name";
  const resolvedBotAvatar =
    (editing?.botAvatarUrl || "").trim() || profile?.profileImage || "";

  return (
    <div className="max-w-7xl">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Webhooks</h2>
          <p className="mt-1 text-sm text-white/50">
            Fully editable Discord live announcements — custom sender name, icon, and every text line.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/50">
            {enabledCount} active · {webhooks.length} total
          </div>
          <button
            onClick={() => {
              setEditing(emptyWebhook());
              setShowUrl(false);
              setEditorTab("basics");
              setNotice(null);
              setProfile(null);
            }}
            className="rounded-lg bg-[#5865F2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#6d78f6]"
          >
            Add webhook
          </button>
        </div>
      </header>

      {notice && (
        <div
          className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
            notice.kind === "success"
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
              : "border-red-500/20 bg-red-500/10 text-red-100"
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.1fr_1.4fr]">
        {/* Left: list */}
        <section className="space-y-3">
          {webhooks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-14 text-center">
              <p className="text-sm font-semibold text-white/70">No Discord automations yet</p>
              <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-white/40">
                Create a webhook with your own sender name, profile icon, and fully editable embed text.
              </p>
              <button
                onClick={() => {
                  setEditing(emptyWebhook());
                  setEditorTab("basics");
                }}
                className="mt-5 rounded-lg bg-[#5865F2] px-4 py-2 text-sm font-semibold text-white"
              >
                Create your first webhook
              </button>
            </div>
          ) : (
            webhooks.map((config) => {
              const status =
                STATUS_STYLES[
                  config.status?.state || (config.enabled ? "idle" : "disabled")
                ];
              return (
                <article
                  key={config.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.18)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-semibold text-white">
                          {config.name}
                        </h3>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${status.className}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                          {status.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-white/45">
                        {config.platform === "kick" ? "Kick" : "Twitch"} · {config.channel}
                        {config.botUsername
                          ? ` · posts as “${config.botUsername}”`
                          : " · posts as channel name"}
                      </p>
                      <p
                        className={`mt-2 text-xs leading-relaxed ${
                          config.status?.state === "error" ? "text-red-300" : "text-white/50"
                        }`}
                      >
                        {config.status?.message ||
                          (config.enabled
                            ? "Waiting for the next status check"
                            : "This automation is disabled")}
                      </p>
                      {config.status?.lastSentAt && (
                        <p className="mt-1 text-[11px] text-white/30">
                          Last announcement:{" "}
                          {new Date(config.status.lastSentAt).toLocaleString()}
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => void toggle(config)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        config.enabled
                          ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                          : "bg-white/5 text-white/45 hover:bg-white/10"
                      }`}
                    >
                      {config.enabled ? "Enabled" : "Disabled"}
                    </button>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setEditing({ ...emptyWebhook(), ...config });
                        setShowUrl(false);
                        setEditorTab("basics");
                        setNotice(null);
                      }}
                      className="rounded-lg bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/75 hover:bg-white/12"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => void test(config)}
                      className="rounded-lg bg-[#5865F2]/15 px-3 py-1.5 text-xs font-semibold text-[#b8c0ff] hover:bg-[#5865F2]/25"
                      title="Send sample announcement to Discord"
                    >
                      Test (Sample)
                    </button>
                    <button
                      onClick={() => void triggerNow(config)}
                      className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25"
                      title="Post announcement right now using live stream data"
                    >
                      Post Live Announcement Now
                    </button>
                    <button
                      onClick={() => void api.check(config.id)}
                      className="rounded-lg bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/75 hover:bg-white/12"
                    >
                      Check now
                    </button>
                    <button
                      onClick={() => void remove(config.id)}
                      className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              );
            })
          )}

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/60">
              Discord setup
            </h3>
            <ol className="mt-4 space-y-3 text-xs leading-relaxed text-white/50">
              <li>1. Open the Discord channel that should get live alerts.</li>
              <li>2. Go to Channel Settings → Integrations → Webhooks.</li>
              <li>3. Create a webhook and copy the URL.</li>
              <li>4. Set your custom username + icon, edit every text line, then send a test.</li>
            </ol>
          </div>
        </section>

        {/* Right: editor + preview */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            {editing ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-white/60">
                      {editing.id ? "Edit webhook" : "New webhook"}
                    </h3>
                    <p className="mt-1 text-xs text-white/40">
                      Every text line is editable. Set who posts and what they say.
                    </p>
                  </div>
                  <button
                    onClick={() => setEditing(null)}
                    className="text-xs text-white/40 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 rounded-xl bg-black/30 p-1">
                  {(
                    [
                      ["basics", "Basics"],
                      ["sender", "Sender"],
                      ["text", "All text"],
                      ["style", "Style"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setEditorTab(id)}
                      className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors sm:text-xs ${
                        editorTab === id
                          ? "bg-[#5865F2] text-white"
                          : "text-white/50 hover:text-white"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* BASICS */}
                {editorTab === "basics" && (
                  <div className="space-y-4">
                    <SectionTitle>Connection</SectionTitle>
                    <Field label="Automation name" badge="editable">
                      <input
                        value={editing.name || ""}
                        onChange={(e) => patch({ name: e.target.value })}
                        className={inputCls}
                        placeholder="e.g. Twitch live Discord"
                      />
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Platform">
                        <select
                          value={editing.platform || "twitch"}
                          onChange={(e) => {
                            const platform = e.target.value as "twitch" | "kick";
                            patch({
                              platform,
                              embedColor:
                                editing.embedColor &&
                                editing.embedColor !== "#9146FF" &&
                                editing.embedColor !== "#53FC18"
                                  ? editing.embedColor
                                  : platform === "kick"
                                    ? "#53FC18"
                                    : "#9146FF",
                            });
                          }}
                          className={`${inputCls} bg-[#17171d]`}
                        >
                          <option value="twitch">Twitch</option>
                          <option value="kick">Kick</option>
                        </select>
                      </Field>
                      <Field label="Channel username" badge="editable" hint="No URL — just the name">
                        <input
                          value={editing.channel || ""}
                          onChange={(e) => patch({ channel: e.target.value })}
                          placeholder="yourchannel"
                          className={inputCls}
                        />
                      </Field>
                    </div>

                    <Field label="Discord webhook URL" badge="required">
                      <div className="flex gap-2">
                        <input
                          type={showUrl ? "text" : "password"}
                          value={editing.discordWebhookUrl || ""}
                          onChange={(e) => patch({ discordWebhookUrl: e.target.value })}
                          placeholder="https://discord.com/api/webhooks/..."
                          className={`${inputCls} min-w-0 flex-1`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowUrl((v) => !v)}
                          className="rounded-xl bg-white/5 px-3 text-xs text-white/50 hover:text-white"
                        >
                          {showUrl ? "Hide" : "Show"}
                        </button>
                      </div>
                    </Field>

                    <Toggle
                      checked={editing.enabled ?? true}
                      onChange={(enabled) => patch({ enabled })}
                      label="Enable automatic monitoring"
                      hint="Checks every minute while Stream Control is open"
                    />

                    <div className="rounded-xl border border-white/8 bg-black/25 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/45">
                          Channel assets
                        </span>
                        {profileLoading && (
                          <span className="text-[10px] text-white/35">Loading…</span>
                        )}
                      </div>
                      {profile ? (
                        <div className="flex items-center gap-3">
                          {profile.profileImage ? (
                            <img
                              src={profile.profileImage}
                              alt=""
                              className="h-12 w-12 rounded-full object-cover ring-2 ring-white/10"
                            />
                          ) : (
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-xs text-white/40">
                              ?
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-white">
                              {profile.displayName}
                            </p>
                            <p className="truncate text-[11px] text-white/40">
                              {profile.bannerImage
                                ? "Profile + banner found"
                                : "Profile found · no banner set"}
                              {profile.live ? " · currently LIVE" : ""}
                            </p>
                          </div>
                          {profile.bannerImage && (
                            <img
                              src={profile.bannerImage}
                              alt=""
                              className="h-10 w-20 rounded object-cover"
                            />
                          )}
                        </div>
                      ) : (
                        <p className="text-[11px] text-white/35">
                          Enter your channel name to pull profile picture and banner automatically.
                        </p>
                      )}
                    </div>

                    <div className="rounded-xl border border-white/8 bg-black/25 p-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/45">
                          Announcement Presets &amp; Templates
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => patch({
                            name: "Live Announcement",
                            message: "@everyone {channel} is now live on {platform}!",
                            embedTitle: "🔴 {channel} is LIVE",
                            embedDescription: "{title}",
                            embedColor: editing.platform === "kick" ? "#53FC18" : "#9146FF",
                          })}
                          className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-white/80 transition-colors"
                        >
                          🔴 Go-Live Alert
                        </button>
                        <button
                          type="button"
                          onClick={() => patch({
                            name: "Pre-Stream Teaser",
                            message: "⏳ @here Get ready! {channel} is going live in 15 minutes!",
                            embedTitle: "🚀 Starting Soon: {title}",
                            embedDescription: "Grab your snacks and join the waiting room on {platform}!",
                            embedColor: "#F5A623",
                          })}
                          className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-white/80 transition-colors"
                        >
                          ⏳ 15m Teaser
                        </button>
                        <button
                          type="button"
                          onClick={() => patch({
                            name: "Stream Summary",
                            message: "🏁 {channel}'s stream has ended! Thanks to everyone who tuned in today.",
                            embedTitle: "📺 VOD Available on {platform}",
                            embedDescription: "Missed the stream? Catch the replay of **{title}** anytime!",
                            embedColor: "#4A90E2",
                          })}
                          className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-white/80 transition-colors"
                        >
                          🏁 Off the Air
                        </button>
                        <button
                          type="button"
                          onClick={() => patch({
                            name: "Clip Showcase",
                            message: "🔥 Check out this epic clip from {channel}'s latest stream!",
                            embedTitle: "🎬 Highlight Showcase",
                            embedDescription: "{title}",
                            embedColor: "#E0245E",
                          })}
                          className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-white/80 transition-colors"
                        >
                          🎬 Clip Showcase
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* SENDER — custom username + icon */}
                {editorTab === "sender" && (
                  <div className="space-y-4">
                    <SectionTitle>Who posts in Discord</SectionTitle>
                    <p className="text-xs leading-relaxed text-white/45">
                      This is the <strong className="text-white/70">username and profile icon</strong>{" "}
                      Discord shows for the message — not the embed content. Leave blank to use your
                      channel name and Twitch/Kick picture.
                    </p>

                    {/* Live sender chip */}
                    <div className="flex items-center gap-3 rounded-xl border border-[#5865F2]/25 bg-[#5865F2]/10 p-3">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-[#5865F2]/40 ring-2 ring-[#5865F2]/40">
                        {resolvedBotAvatar ? (
                          <img
                            src={resolvedBotAvatar}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs font-bold text-white/70">
                            SC
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                          Messages will post as
                        </p>
                        <p className="truncate text-base font-semibold text-white">
                          {resolvedBotName}
                        </p>
                        <p className="text-[11px] text-white/40">
                          {(editing.botAvatarUrl || "").trim()
                            ? "Custom icon"
                            : profile?.profileImage
                              ? "Using channel profile picture"
                              : "Default icon until channel is loaded"}
                        </p>
                      </div>
                    </div>

                    <Field
                      label="Custom username"
                      badge="editable"
                      hint="Max ~80 characters. Discord shows this as the poster name."
                    >
                      <input
                        value={editing.botUsername || ""}
                        onChange={(e) => patch({ botUsername: e.target.value })}
                        placeholder={
                          profile?.displayName ||
                          editing.channel ||
                          "e.g. CLASIX Live"
                        }
                        className={inputCls}
                        maxLength={80}
                      />
                    </Field>

                    <Field
                      label="Custom profile icon URL"
                      badge="editable"
                      hint="Direct image link (png/jpg/webp/gif). Leave blank to use your Twitch/Kick profile picture."
                    >
                      <input
                        value={editing.botAvatarUrl || ""}
                        onChange={(e) => patch({ botAvatarUrl: e.target.value })}
                        placeholder="https://i.imgur.com/… or any image URL"
                        className={inputCls}
                      />
                    </Field>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={useTwitchAvatar}
                        disabled={!profile?.profileImage}
                        className="rounded-lg bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/75 hover:bg-white/12 disabled:opacity-40"
                      >
                        Use channel profile picture
                      </button>
                      <button
                        type="button"
                        onClick={() => patch({ botAvatarUrl: "", botUsername: "" })}
                        className="rounded-lg bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/75 hover:bg-white/12"
                      >
                        Reset to defaults
                      </button>
                    </div>

                    {(editing.botAvatarUrl || "").trim() && (
                      <div className="rounded-xl border border-white/8 bg-black/25 p-3">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                          Icon preview
                        </p>
                        <div className="flex items-center gap-3">
                          <img
                            src={(editing.botAvatarUrl || "").trim()}
                            alt="Custom avatar"
                            className="h-16 w-16 rounded-full object-cover ring-2 ring-white/10"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.opacity = "0.3";
                            }}
                          />
                          <p className="text-[11px] text-white/40">
                            If this doesn’t load, Discord won’t show the icon either — check the URL.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ALL TEXT — every string clearly editable */}
                {editorTab === "text" && (
                  <div className="space-y-4">
                    <SectionTitle>Message content</SectionTitle>
                    <p className="text-[10px] leading-relaxed text-white/35">
                      Variables you can paste into any field:{" "}
                      <span className="font-mono text-white/55">{TEMPLATE_HINT}</span>
                    </p>

                    <Field
                      label="Message above embed"
                      badge="editable"
                      hint="Plain text Discord shows above the card. Use @everyone only if allowed below."
                    >
                      <textarea
                        value={editing.message ?? DEFAULT_MESSAGE}
                        onChange={(e) => patch({ message: e.target.value })}
                        rows={3}
                        className={`${inputCls} resize-y`}
                        placeholder={DEFAULT_MESSAGE}
                      />
                    </Field>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Toggle
                        checked={editing.mentionEveryone ?? false}
                        onChange={(mentionEveryone) => patch({ mentionEveryone })}
                        label="Allow @everyone / mentions"
                        hint="Required if message includes @everyone"
                      />
                      <Toggle
                        checked={editing.useEmbed !== false}
                        onChange={(useEmbed) => patch({ useEmbed })}
                        label="Send styled embed card"
                        hint="Off = plain text only"
                      />
                    </div>

                    {editing.useEmbed !== false && (
                      <>
                        <SectionTitle>Embed text lines</SectionTitle>

                        <Field
                          label="Author line"
                          badge="editable"
                          hint="Small line above the title (with profile icon when enabled)"
                        >
                          <input
                            value={editing.embedAuthor ?? DEFAULT_EMBED_AUTHOR}
                            onChange={(e) => patch({ embedAuthor: e.target.value })}
                            className={inputCls}
                            placeholder={DEFAULT_EMBED_AUTHOR}
                          />
                        </Field>

                        <Field label="Embed title" badge="editable">
                          <input
                            value={editing.embedTitle ?? DEFAULT_EMBED_TITLE}
                            onChange={(e) => patch({ embedTitle: e.target.value })}
                            className={inputCls}
                            placeholder={DEFAULT_EMBED_TITLE}
                          />
                        </Field>

                        <Field label="Embed description" badge="editable">
                          <textarea
                            value={editing.embedDescription ?? DEFAULT_EMBED_DESCRIPTION}
                            onChange={(e) => patch({ embedDescription: e.target.value })}
                            rows={3}
                            className={`${inputCls} resize-y`}
                            placeholder={DEFAULT_EMBED_DESCRIPTION}
                          />
                        </Field>

                        <Field label="Embed footer" badge="editable">
                          <input
                            value={editing.embedFooter ?? DEFAULT_EMBED_FOOTER}
                            onChange={(e) => patch({ embedFooter: e.target.value })}
                            className={inputCls}
                            placeholder={DEFAULT_EMBED_FOOTER}
                          />
                        </Field>

                        <SectionTitle>Field labels</SectionTitle>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <Field label="Category field label" badge="editable">
                            <input
                              value={editing.gameFieldLabel ?? DEFAULT_GAME_FIELD_LABEL}
                              onChange={(e) => patch({ gameFieldLabel: e.target.value })}
                              className={inputCls}
                              placeholder={DEFAULT_GAME_FIELD_LABEL}
                            />
                          </Field>
                          <Field label="Viewers field label" badge="editable">
                            <input
                              value={
                                editing.viewersFieldLabel ?? DEFAULT_VIEWERS_FIELD_LABEL
                              }
                              onChange={(e) => patch({ viewersFieldLabel: e.target.value })}
                              className={inputCls}
                              placeholder={DEFAULT_VIEWERS_FIELD_LABEL}
                            />
                          </Field>
                          <Field label="Watch field label" badge="editable">
                            <input
                              value={editing.watchFieldLabel ?? DEFAULT_WATCH_FIELD_LABEL}
                              onChange={(e) => patch({ watchFieldLabel: e.target.value })}
                              className={inputCls}
                              placeholder={DEFAULT_WATCH_FIELD_LABEL}
                            />
                          </Field>
                          <Field label="Watch link text" badge="editable">
                            <input
                              value={editing.watchFieldValue ?? DEFAULT_WATCH_FIELD_VALUE}
                              onChange={(e) => patch({ watchFieldValue: e.target.value })}
                              className={inputCls}
                              placeholder={DEFAULT_WATCH_FIELD_VALUE}
                            />
                          </Field>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* STYLE */}
                {editorTab === "style" && (
                  <div className="space-y-4">
                    <SectionTitle>Colors & images</SectionTitle>

                    <Field label="Embed accent color" badge="editable">
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={
                            /^#[0-9a-fA-F]{6}$/.test(editing.embedColor || "")
                              ? editing.embedColor
                              : editing.platform === "kick"
                                ? "#53FC18"
                                : "#9146FF"
                          }
                          onChange={(e) =>
                            patch({ embedColor: e.target.value.toUpperCase() })
                          }
                          className="h-[42px] w-12 cursor-pointer rounded-xl border border-white/10 bg-black/35 p-1"
                        />
                        <input
                          value={editing.embedColor || ""}
                          onChange={(e) => patch({ embedColor: e.target.value })}
                          placeholder="#9146FF"
                          className={`${inputCls} flex-1 font-mono`}
                        />
                      </div>
                    </Field>

                    <SectionTitle>What to show</SectionTitle>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Toggle
                        checked={editing.showProfileImage !== false}
                        onChange={(showProfileImage) => patch({ showProfileImage })}
                        label="Channel profile picture"
                        hint="Author icon + thumbnail in the embed"
                      />
                      <Toggle
                        checked={editing.showBanner !== false}
                        onChange={(showBanner) => patch({ showBanner })}
                        label="Channel banner"
                        hint="Large image in the embed"
                      />
                      <Toggle
                        checked={editing.showStreamPreview === true}
                        onChange={(showStreamPreview) =>
                          patch({
                            showStreamPreview,
                            showBanner: showStreamPreview
                              ? false
                              : editing.showBanner !== false,
                          })
                        }
                        label="Live stream preview"
                        hint="Uses stream thumbnail when live"
                      />
                      <Toggle
                        checked={editing.showGame !== false}
                        onChange={(showGame) => patch({ showGame })}
                        label="Category / game field"
                      />
                      <Toggle
                        checked={editing.showViewers === true}
                        onChange={(showViewers) => patch({ showViewers })}
                        label="Viewer count field"
                      />
                      <Toggle
                        checked={editing.showWatchLink !== false}
                        onChange={(showWatchLink) => patch({ showWatchLink })}
                        label="Watch link field"
                      />
                      <Toggle
                        checked={editing.showTimestamp !== false}
                        onChange={(showTimestamp) => patch({ showTimestamp })}
                        label="Timestamp"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => void test(editing)}
                    disabled={busy || !editing.discordWebhookUrl}
                    className="rounded-xl bg-white/10 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Send test
                  </button>
                  <button
                    onClick={() => void save()}
                    disabled={busy}
                    className="rounded-xl bg-[#5865F2] py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Save webhook
                  </button>
                  <button
                    onClick={() => void triggerNow(editing)}
                    disabled={busy || !editing.discordWebhookUrl}
                    className="rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-black disabled:opacity-40 col-span-2 shadow-lg hover:bg-emerald-400 transition-colors"
                  >
                    Post Live Announcement Now
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-white/60">
                  How this works
                </h3>
                <div className="mt-4 space-y-3 text-xs leading-relaxed text-white/50">
                  <p>
                    <strong className="text-white/70">Sender</strong> tab — set the custom Discord
                    username and profile icon that posts the announcement.
                  </p>
                  <p>
                    <strong className="text-white/70">All text</strong> tab — edit every line:
                    message, author, title, description, footer, and field labels.
                  </p>
                  <p>
                    Stream Control checks enabled channels every minute while the app is open.
                    Each live session is announced once.
                  </p>
                </div>
              </div>
            )}
          </div>

          {editing && <EmbedPreview config={editing} profile={profile} />}
        </aside>
      </div>
    </div>
  );
}

export const webhooksTab: Tab = {
  id: "webhooks",
  name: "Webhooks",
  icon: <WebhookIcon />,
  description: "Manage Discord and stream automations.",
  Component: WebhooksModule,
};

export const webhooksModule = webhooksTab;
