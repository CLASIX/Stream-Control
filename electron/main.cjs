const { app, BrowserWindow, dialog, globalShortcut, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { randomUUID } = require("crypto");
const { exec } = require("child_process");

/**
 * Desktop wrapper for Stream Control.
 *
 * Implements a non-Premium Spotify window-title tracker.
 *
 * It serves the built Vite app on port 8080 and exposes a local JSON API
 * `/api/local-track` that returns the current track title + artist + album art.
 * Since both the dashboard and overlay run on port 8080, they can query
 * this local endpoint to show your music without needing a Spotify Premium API.
 */

const HOST = "127.0.0.1";
const PORT = 8080;
let server = null;

/* ------------------------------------------------------------------ */
/* streamer.bot bridge (HTTP → renderer via IPC)                      */
/* ------------------------------------------------------------------ */

let bridgeConfig = {
  apiKey: "",
  allowUnauthed: true,
};

const BRIDGE_ACTIONS = [
  "ping",
  "status",
  "set_scene",
  "start_stream",
  "stop_stream",
  "start_record",
  "stop_record",
  "mute",
  "set_volume",
  "toggle_source",
  "go_live",
  "end_stream",
  "enable_webhooks",
  "disable_webhooks",
  "mark_moment",
  "create_clip",
  "save_replay",
];

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function bridgeAuthOk(req, url) {
  if (bridgeConfig.allowUnauthed && !bridgeConfig.apiKey) return true;
  if (bridgeConfig.allowUnauthed && !String(bridgeConfig.apiKey || "").trim())
    return true;
  const key =
    req.headers["x-stream-control-key"] ||
    req.headers["x-api-key"] ||
    url.searchParams.get("key") ||
    "";
  if (!bridgeConfig.apiKey) return bridgeConfig.allowUnauthed;
  return key === bridgeConfig.apiKey;
}

/**
 * Forward an action to the first dashboard BrowserWindow's renderer.
 * BridgeHost in the UI executes against OBS / webhooks and replies.
 */
function dispatchBridgeAction(payload) {
  return new Promise((resolve) => {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
    if (!win) {
      resolve({
        ok: false,
        error:
          "Stream Control UI is not open. Open the dashboard window and try again.",
      });
      return;
    }

    const requestId = randomUUID();
    const timeout = setTimeout(() => {
      ipcMain.removeListener("bridge:action-result", onResult);
      resolve({ ok: false, error: "Bridge action timed out (8s)" });
    }, 8000);

    function onResult(_event, result) {
      if (!result || result.requestId !== requestId) return;
      clearTimeout(timeout);
      ipcMain.removeListener("bridge:action-result", onResult);
      resolve({
        ok: Boolean(result.ok),
        result: result.result,
        error: result.error,
      });
    }

    ipcMain.on("bridge:action-result", onResult);
    win.webContents.send("bridge:action", {
      requestId,
      action: payload.action,
      params: payload.params || {},
    });
  });
}

function toElectronAccelerator(value) {
  return String(value || "")
    .trim()
    .replace(/\bCtrl\b/g, "Control")
    .replace(/\bMeta\b/g, "Super")
    .replace(/ArrowUp/g, "Up")
    .replace(/ArrowDown/g, "Down")
    .replace(/ArrowLeft/g, "Left")
    .replace(/ArrowRight/g, "Right")
    .replace(/Escape/g, "Esc");
}

ipcMain.handle("hotkeys:configure", (_event, bindings) => {
  globalShortcut.unregisterAll();
  const used = new Set();
  for (const binding of Array.isArray(bindings) ? bindings : []) {
    const accelerator = toElectronAccelerator(binding?.accelerator);
    const action = String(binding?.action || "").trim();
    if (!accelerator || !action || used.has(accelerator)) continue;
    try {
      if (globalShortcut.register(accelerator, () => void dispatchBridgeAction({ action }))) {
        used.add(accelerator);
      }
    } catch {
      // Ignore unsupported combinations; the shortcut control stays editable.
    }
  }
  return true;
});

async function handleBridgeRequest(req, res, url) {
  if (!bridgeAuthOk(req, url)) {
    sendJson(res, 401, { ok: false, error: "Unauthorized — set X-Stream-Control-Key" });
    return true;
  }

  if (url.pathname === "/api/bridge/health" && req.method === "GET") {
    sendJson(res, 200, {
      ok: true,
      service: "stream-control-bridge",
      at: new Date().toISOString(),
    });
    return true;
  }

  if (url.pathname === "/api/bridge/actions" && req.method === "GET") {
    sendJson(res, 200, { ok: true, actions: BRIDGE_ACTIONS });
    return true;
  }

  if (url.pathname === "/api/bridge/action" && req.method === "POST") {
    try {
      const body = await readRequestBody(req);
      const action = String(body.action || "").trim();
      if (!action) {
        sendJson(res, 400, { ok: false, error: "Missing action" });
        return true;
      }
      const result = await dispatchBridgeAction({
        action,
        params: body.params || {},
      });
      sendJson(res, result.ok ? 200 : 500, result);
    } catch (e) {
      sendJson(res, 400, {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    return true;
  }

  return false;
}

/* ------------------------------------------------------------------ */
/* Discord live-announcement webhooks                                 */
/* ------------------------------------------------------------------ */

const WEBHOOK_POLL_MS = 60_000;
const webhookStatuses = new Map();
const activeWebhookChecks = new Set();
let webhookConfigs = [];
let webhookTimer = null;

function webhookFilePath() {
  return path.join(app.getPath("userData"), "webhooks.json");
}

function loadWebhookConfigs() {
  try {
    const raw = fs.readFileSync(webhookFilePath(), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistWebhookConfigs() {
  try {
    fs.mkdirSync(path.dirname(webhookFilePath()), { recursive: true });
    fs.writeFileSync(webhookFilePath(), JSON.stringify(webhookConfigs, null, 2), "utf8");
  } catch (error) {
    console.error("Could not save webhooks:", error);
  }
}

function publicWebhook(config) {
  return {
    ...config,
    status: webhookStatuses.get(config.id) || {
      state: config.enabled ? "idle" : "disabled",
      message: config.enabled ? "Waiting for the next check" : "Disabled",
    },
  };
}

function broadcastWebhookUpdate() {
  const payload = webhookConfigs.map(publicWebhook);
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send("webhooks:updated", payload);
  });
}

function setWebhookStatus(id, status) {
  webhookStatuses.set(id, {
    ...webhookStatuses.get(id),
    ...status,
  });
  broadcastWebhookUpdate();
}

function normalizeChannel(value) {
  return String(value || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(www\.)?(twitch\.tv|kick\.com)\//i, "")
    .split(/[/?#]/)[0]
    .toLowerCase();
}

function validateDiscordWebhookUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "discord.com" || url.hostname === "discordapp.com") &&
      url.pathname.startsWith("/api/webhooks/")
    );
  } catch {
    return false;
  }
}

const DEFAULT_EMBED_COLOR_TWITCH = 0x9146ff;
const DEFAULT_EMBED_COLOR_KICK = 0x53fc18;
const DEFAULT_MESSAGE = "@everyone {channel} is now live on {platform}!";
const DEFAULT_EMBED_TITLE = "🔴 {channel} is LIVE";
const DEFAULT_EMBED_DESCRIPTION = "{title}";
const DEFAULT_EMBED_AUTHOR = "{channel} · {platform}";
const DEFAULT_EMBED_FOOTER = "Stream Control · {platform}";
const DEFAULT_GAME_FIELD_LABEL = "📂 Category";
const DEFAULT_VIEWERS_FIELD_LABEL = "👀 Viewers";
const DEFAULT_WATCH_FIELD_LABEL = "🔗 Watch";
const DEFAULT_WATCH_FIELD_VALUE = "Open on {platform}";

function parseEmbedColor(value, platform) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(0xffffff, Math.floor(value)));
  }
  const raw = String(value || "").trim();
  if (raw) {
    const hex = raw.startsWith("#") ? raw.slice(1) : raw;
    if (/^[0-9a-fA-F]{6}$/.test(hex)) return parseInt(hex, 16);
  }
  return platform === "kick" ? DEFAULT_EMBED_COLOR_KICK : DEFAULT_EMBED_COLOR_TWITCH;
}

async function fetchTwitchLive(channel) {
  const response = await fetch("https://gql.twitch.tv/gql", {
    method: "POST",
    headers: {
      "Client-ID": "kimne78kx3ncx6brgo4mv6wki5h1ko",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `query StreamControlLiveStatus($login: String!) {
        user(login: $login) {
          displayName
          login
          description
          profileImageURL(width: 300)
          bannerImageURL
          stream {
            id
            title
            type
            createdAt
            viewersCount
            previewImageURL(width: 1280, height: 720)
            game { name }
          }
        }
      }`,
      variables: { login: channel },
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) throw new Error(`Twitch status check failed (${response.status})`);
  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message || "Twitch status check failed");
  }

  const user = payload.data?.user;
  if (!user) throw new Error("Twitch channel was not found");

  const profileImage =
    user.profileImageURL ||
    `https://static-cdn.jtvnw.net/jtv_user_pictures/${channel}-profile_image-300x300.png`;
  const bannerImage = user.bannerImageURL || "";
  const login = user.login || channel;

  if (!user.stream) {
    return {
      live: false,
      displayName: user.displayName || channel,
      login,
      profileImage,
      bannerImage,
      description: user.description || "",
      url: `https://twitch.tv/${login}`,
    };
  }

  const streamPreview =
    user.stream.previewImageURL ||
    `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-1280x720.jpg`;

  return {
    live: true,
    id: String(user.stream.id || `${channel}-${user.stream.createdAt}`),
    displayName: user.displayName || channel,
    login,
    title: user.stream.title || "Live now",
    game: user.stream.game?.name || "",
    viewers: Number(user.stream.viewersCount) || 0,
    startedAt: user.stream.createdAt || "",
    profileImage,
    bannerImage,
    streamPreview,
    description: user.description || "",
    url: `https://twitch.tv/${login}`,
  };
}

async function fetchKickLive(channel) {
  const response = await fetch(
    `https://kick.com/api/v2/channels/${encodeURIComponent(channel)}`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 Stream-Control/1.0",
      },
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (response.status === 404) throw new Error("Kick channel was not found");
  if (!response.ok) throw new Error(`Kick status check failed (${response.status})`);
  const payload = await response.json();
  const user = payload?.user || {};
  const displayName = user.username || payload?.slug || channel;
  const profileImage = user.profile_pic || user.profilepic || "";
  const bannerImage =
    user.banner_image?.url ||
    user.banner_image ||
    payload?.banner_image?.url ||
    payload?.banner_image ||
    "";

  const livestream = payload?.livestream;
  if (!livestream || livestream.is_live === false) {
    return {
      live: false,
      displayName,
      login: channel,
      profileImage,
      bannerImage,
      description: user.bio || "",
      url: `https://kick.com/${channel}`,
    };
  }

  return {
    live: true,
    id: String(livestream.id || `${channel}-${livestream.created_at || "live"}`),
    displayName,
    login: channel,
    title: livestream.session_title || livestream.title || "Live now",
    game: livestream.categories?.[0]?.name || livestream.category?.name || "",
    viewers: Number(livestream.viewer_count || livestream.viewers || 0) || 0,
    startedAt: livestream.created_at || livestream.start_time || "",
    profileImage,
    bannerImage,
    streamPreview:
      livestream.thumbnail?.url ||
      livestream.thumbnail?.src ||
      livestream.thumbnail ||
      "",
    description: user.bio || "",
    url: `https://kick.com/${channel}`,
  };
}

async function fetchLiveStatus(platform, channel) {
  return platform === "kick"
    ? fetchKickLive(channel)
    : fetchTwitchLive(channel);
}

/** Offline profile lookup used by tests / previews when not live. */
async function fetchChannelProfile(platform, channel) {
  const status = await fetchLiveStatus(platform, channel);
  return {
    displayName: status.displayName || channel,
    login: status.login || channel,
    profileImage: status.profileImage || "",
    bannerImage: status.bannerImage || "",
    description: status.description || "",
    url: status.url || "",
    live: Boolean(status.live),
    title: status.title || "",
    game: status.game || "",
    viewers: status.viewers || 0,
    streamPreview: status.streamPreview || "",
    id: status.id,
  };
}

function fillTemplate(template, config, live) {
  const platformName = config.platform === "kick" ? "Kick" : "Twitch";
  const viewers =
    live.viewers != null && live.viewers !== ""
      ? String(live.viewers)
      : "0";
  return String(template ?? "")
    .replaceAll("{channel}", live.displayName || config.channel || "")
    .replaceAll("{platform}", platformName)
    .replaceAll("{title}", live.title || "Live now")
    .replaceAll("{game}", live.game || "Just Chatting")
    .replaceAll("{url}", live.url || "")
    .replaceAll("{viewers}", viewers)
    .replaceAll("{login}", live.login || config.channel || "");
}

function buildDiscordPayload(config, live, isTest = false) {
  const platformName = config.platform === "kick" ? "Kick" : "Twitch";
  const displayName = live.displayName || config.channel || "Streamer";
  const botUsername =
    String(config.botUsername || "").trim() || displayName || "Stream Control";
  const botAvatar =
    String(config.botAvatarUrl || "").trim() || live.profileImage || undefined;

  const contentTemplate = isTest
    ? config.testMessage ||
      `✅ Stream Control test for **${config.name || "live announcement"}** — webhook is connected.`
    : config.message ?? DEFAULT_MESSAGE;
  const content = fillTemplate(contentTemplate, config, {
    ...live,
    title: live.title || "Test stream title",
    game: live.game || "Just Chatting",
    url: live.url || (config.platform === "kick"
      ? `https://kick.com/${config.channel}`
      : `https://twitch.tv/${config.channel}`),
  }).trim();

  const useEmbed = config.useEmbed !== false;
  if (!useEmbed) {
    return {
      content: content || undefined,
      username: botUsername,
      avatar_url: botAvatar,
      allowed_mentions: config.mentionEveryone
        ? { parse: ["everyone", "roles", "users"] }
        : { parse: [] },
    };
  }

  const color = parseEmbedColor(config.embedColor, config.platform);
  const title = fillTemplate(
    config.embedTitle || DEFAULT_EMBED_TITLE,
    config,
    live
  ).trim();
  const description = fillTemplate(
    config.embedDescription || DEFAULT_EMBED_DESCRIPTION,
    config,
    {
      ...live,
      title: live.title || "Test stream title",
    }
  ).trim();
  const authorText = fillTemplate(
    config.embedAuthor || DEFAULT_EMBED_AUTHOR,
    config,
    live
  ).trim();
  const footerText = fillTemplate(
    config.embedFooter || DEFAULT_EMBED_FOOTER,
    config,
    live
  ).trim();

  const showProfile = config.showProfileImage !== false;
  const showBanner = config.showBanner !== false;
  const showStreamPreview = config.showStreamPreview === true;
  const showGame = config.showGame !== false;
  const showViewers = config.showViewers === true;
  const showWatchLink = config.showWatchLink !== false;
  const showTimestamp = config.showTimestamp !== false;

  const fields = [];
  if (showGame && (live.game || isTest)) {
    fields.push({
      name: fillTemplate(
        config.gameFieldLabel || DEFAULT_GAME_FIELD_LABEL,
        config,
        live
      ).trim() || DEFAULT_GAME_FIELD_LABEL,
      value: live.game || "Just Chatting",
      inline: true,
    });
  }
  if (showViewers && (live.viewers != null || isTest)) {
    fields.push({
      name: fillTemplate(
        config.viewersFieldLabel || DEFAULT_VIEWERS_FIELD_LABEL,
        config,
        live
      ).trim() || DEFAULT_VIEWERS_FIELD_LABEL,
      value: String(live.viewers ?? "—"),
      inline: true,
    });
  }
  if (showWatchLink) {
    const watchLabel =
      fillTemplate(
        config.watchFieldLabel || DEFAULT_WATCH_FIELD_LABEL,
        config,
        live
      ).trim() || DEFAULT_WATCH_FIELD_LABEL;
    const watchValueText =
      fillTemplate(
        config.watchFieldValue || DEFAULT_WATCH_FIELD_VALUE,
        config,
        live
      ).trim() || `Open on ${platformName}`;
    const watchUrl =
      live.url ||
      (config.platform === "kick"
        ? `https://kick.com/${config.channel}`
        : `https://twitch.tv/${config.channel}`);
    fields.push({
      name: watchLabel,
      value: `[${watchValueText}](${watchUrl})`,
      inline: true,
    });
  }

  // Prefer stream preview as large image when live + enabled; otherwise banner.
  let imageUrl = "";
  if (showStreamPreview && live.streamPreview) imageUrl = live.streamPreview;
  else if (showBanner && live.bannerImage) imageUrl = live.bannerImage;

  const embed = {
    title: title || undefined,
    description: description || undefined,
    url:
      live.url ||
      (config.platform === "kick"
        ? `https://kick.com/${config.channel}`
        : `https://twitch.tv/${config.channel}`),
    color,
    fields: fields.length ? fields : undefined,
    timestamp: showTimestamp ? new Date().toISOString() : undefined,
  };

  if (showProfile && (authorText || live.profileImage)) {
    embed.author = {
      name: authorText || displayName,
      url: embed.url,
      icon_url: live.profileImage || undefined,
    };
  }
  if (showProfile && live.profileImage) {
    embed.thumbnail = { url: live.profileImage };
  }

  if (imageUrl) {
    embed.image = { url: imageUrl };
  }

  if (footerText) {
    embed.footer = {
      text: footerText,
      icon_url: showProfile && live.profileImage ? live.profileImage : undefined,
    };
  }

  return {
    content: content || undefined,
    username: botUsername,
    avatar_url: botAvatar,
    embeds: [embed],
    allowed_mentions: config.mentionEveryone
      ? { parse: ["everyone", "roles", "users"] }
      : { parse: [] },
  };
}

async function postDiscordWebhook(config, live, isTest = false) {
  if (!validateDiscordWebhookUrl(config.discordWebhookUrl)) {
    throw new Error("Enter a valid Discord webhook URL");
  }

  // For tests, try to pull real profile/banner so the sample looks correct.
  let payloadLive = { ...(live || {}) };
  if (isTest && config.channel) {
    try {
      const profile = await fetchChannelProfile(
        config.platform === "kick" ? "kick" : "twitch",
        normalizeChannel(config.channel)
      );
      payloadLive = {
        ...profile,
        title: profile.live && profile.title ? profile.title : "Test stream — ignore me",
        game: profile.game || "Just Chatting",
        viewers: profile.viewers || 0,
      };
    } catch {
      payloadLive = {
        displayName: config.channel,
        login: config.channel,
        title: "Test stream — ignore me",
        game: "Just Chatting",
        viewers: 0,
        profileImage: "",
        bannerImage: "",
        url:
          config.platform === "kick"
            ? `https://kick.com/${config.channel}`
            : `https://twitch.tv/${config.channel}`,
      };
    }
  }

  const body = buildDiscordPayload(config, payloadLive, isTest);

  const response = await fetch(config.discordWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.json())?.message || "";
    } catch {
      /* no response body */
    }
    throw new Error(
      `Discord rejected the webhook (${response.status})${detail ? `: ${detail}` : ""}`
    );
  }
}

async function checkLiveWebhook(config, announce = true) {
  if (!config?.id || activeWebhookChecks.has(config.id)) return;
  activeWebhookChecks.add(config.id);
  setWebhookStatus(config.id, {
    state: "checking",
    message: "Checking stream status",
    lastCheckedAt: new Date().toISOString(),
  });

  try {
    const channel = normalizeChannel(config.channel);
    if (!channel) throw new Error("Enter a channel name");
    const live = await fetchLiveStatus(config.platform, channel);

    if (!live.live) {
      setWebhookStatus(config.id, {
        state: "offline",
        message: `${channel} is offline`,
        lastCheckedAt: new Date().toISOString(),
      });
      return;
    }

    const streamId = String(live.id || `${config.platform}-${channel}-live`);
    if (announce && streamId !== config.lastAnnouncedStreamId) {
      await postDiscordWebhook(config, live);
      config.lastAnnouncedStreamId = streamId;
      config.lastSentAt = new Date().toISOString();
      persistWebhookConfigs();
      setWebhookStatus(config.id, {
        state: "sent",
        message: "Live announcement sent",
        lastCheckedAt: new Date().toISOString(),
        lastSentAt: config.lastSentAt,
        title: live.title,
      });
      return;
    }

    setWebhookStatus(config.id, {
      state: "live",
      message: announce
        ? "Live (this session was already announced)"
        : "Channel is live",
      lastCheckedAt: new Date().toISOString(),
      lastSentAt: config.lastSentAt,
      title: live.title,
    });
  } catch (error) {
    setWebhookStatus(config.id, {
      state: "error",
      message: error instanceof Error ? error.message : String(error),
      lastCheckedAt: new Date().toISOString(),
    });
  } finally {
    activeWebhookChecks.delete(config.id);
  }
}

async function checkAllLiveWebhooks() {
  await Promise.all(
    webhookConfigs
      .filter((config) => config.enabled)
      .map((config) => checkLiveWebhook(config, true))
  );
}

function startWebhookMonitor() {
  webhookConfigs = loadWebhookConfigs();
  if (webhookTimer) clearInterval(webhookTimer);
  webhookTimer = setInterval(() => void checkAllLiveWebhooks(), WEBHOOK_POLL_MS);
  setTimeout(() => void checkAllLiveWebhooks(), 2500);
}

let localTrack = {
  id: "local",
  name: "",
  artist: "",
  album: "",
  albumArt: "",
  isPlaying: false,
  durationMs: 0,
  progressMs: 0,
};

let lastPolledTitle = "";
/** Prevent overlapping PowerShell / osascript polls when a check is still running. */
let localSpotifyPollInFlight = false;
/** How often we read the Spotify window / AppleScript (ms). Lower = faster song switches. */
const LOCAL_SPOTIFY_POLL_MS = 1000;

/** Cache of resolved artwork so we don't re-query the same song every poll. */
const metadataCache = new Map(); // key -> { album, albumArt, at }
const METADATA_CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

/* ------------------------------------------------------------------ */
/* Artwork matching helpers                                           */
/* ------------------------------------------------------------------ */

/** Lowercase, strip accents, drop common noise words / punctuation. */
function normalizeMusicText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // accents
    .replace(/&/g, " and ")
    .replace(/\b(feat|ft|featuring|with|prod|produced by)\b\.?/g, " ")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ") // (remastered), [explicit], etc.
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Token set for fuzzy containment checks. */
function tokenSet(value) {
  const stop = new Set(["the", "a", "an", "and", "of", "to", "in", "on", "for", "vs", "x"]);
  return new Set(
    normalizeMusicText(value)
      .split(" ")
      .filter((t) => t.length > 1 && !stop.has(t))
  );
}

/** How much of `needle` is covered by `haystack` (0–1). */
function tokenCoverage(needle, haystack) {
  const n = tokenSet(needle);
  const h = tokenSet(haystack);
  if (n.size === 0) return 0;
  let hit = 0;
  for (const t of n) if (h.has(t)) hit += 1;
  return hit / n.size;
}

/**
 * Score a candidate track against the Spotify window-title artist/title.
 * Higher is better. Returns 0 when clearly wrong.
 */
function scoreCandidate(wantArtist, wantTitle, gotArtist, gotTitle) {
  const wA = normalizeMusicText(wantArtist);
  const wT = normalizeMusicText(wantTitle);
  const gA = normalizeMusicText(gotArtist);
  const gT = normalizeMusicText(gotTitle);

  if (!wT || !gT) return 0;

  // Title similarity
  let titleScore = 0;
  if (wT === gT) titleScore = 1;
  else if (gT.includes(wT) || wT.includes(gT)) titleScore = 0.85;
  else titleScore = tokenCoverage(wT, gT);

  // Artist similarity (Spotify titles sometimes only list one of several artists)
  let artistScore = 0;
  if (!wA) artistScore = 0.5;
  else if (wA === gA) artistScore = 1;
  else if (gA.includes(wA) || wA.includes(gA)) artistScore = 0.9;
  else {
    // Multi-artist: "A, B" / "A & B" vs single name
    const wantParts = wA.split(/\s*(?:,| and | x | vs )\s*/).filter(Boolean);
    const gotParts = gA.split(/\s*(?:,| and | x | vs )\s*/).filter(Boolean);
    const anyPart =
      wantParts.some((p) => gotParts.some((g) => g.includes(p) || p.includes(g))) ||
      tokenCoverage(wA, gA) >= 0.5;
    artistScore = anyPart ? Math.max(0.55, tokenCoverage(wA, gA)) : tokenCoverage(wA, gA);
  }

  // Hard rejects — wrong song family or totally different artist
  if (titleScore < 0.55) return 0;
  if (artistScore < 0.35 && titleScore < 0.95) return 0;

  // Weighted blend (title matters most for cover correctness)
  return titleScore * 0.6 + artistScore * 0.4;
}

function pickBestResult(wantArtist, wantTitle, candidates) {
  let best = null;
  let bestScore = 0;
  for (const c of candidates) {
    const score = scoreCandidate(wantArtist, wantTitle, c.artist, c.title);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  // Require a reasonably confident match so we don't show a wrong cover
  if (!best || bestScore < 0.62) return null;
  return { ...best, score: bestScore };
}

async function searchItunes(artist, title) {
  const queries = [
    `${artist} ${title}`.trim(),
    title && artist ? `${title} ${artist}` : "",
    // Stripped variants help with "Song (feat. X) - Remastered"
    `${artist} ${normalizeMusicText(title)}`.trim(),
  ].filter(Boolean);

  const seen = new Set();
  const candidates = [];

  for (const query of queries) {
    if (seen.has(query)) continue;
    seen.add(query);
    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
        query
      )}&entity=song&limit=15`;
      const response = await fetch(url, {
        headers: { "User-Agent": "Stream-Control/1.0" },
        signal: AbortSignal.timeout(4500),
      });
      if (!response.ok) continue;
      const parsed = await response.json();
      for (const song of parsed?.results || []) {
        if (!song?.artworkUrl100) continue;
        candidates.push({
          artist: song.artistName || "",
          title: song.trackName || "",
          album: song.collectionName || "",
          albumArt: String(song.artworkUrl100).replace("100x100bb", "600x600bb"),
          source: "itunes",
        });
      }
    } catch {
      /* try next query / provider */
    }
    if (candidates.length >= 15) break;
  }

  return pickBestResult(artist, title, candidates);
}

async function searchDeezer(artist, title) {
  const queries = [
    `artist:"${artist}" track:"${title}"`,
    `${artist} ${title}`.trim(),
    `track:"${title}"`,
  ].filter(Boolean);

  const candidates = [];
  for (const query of queries) {
    try {
      const response = await fetch(
        `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=12`,
        {
          headers: { "User-Agent": "Stream-Control/1.0" },
          signal: AbortSignal.timeout(4500),
        }
      );
      if (!response.ok) continue;
      const parsed = await response.json();
      for (const song of parsed?.data || []) {
        if (!song?.album) continue;
        candidates.push({
          artist: song.artist?.name || "",
          title: song.title || song.title_short || "",
          album: song.album.title || "",
          albumArt: song.album.cover_xl || song.album.cover_big || song.album.cover_medium || "",
          source: "deezer",
        });
      }
    } catch {
      /* try next */
    }
    if (candidates.length >= 12) break;
  }

  return pickBestResult(artist, title, candidates);
}

/**
 * Fetch album name + high-res artwork.
 * Scores iTunes + Deezer results so we don't blindly take result[0].
 */
async function fetchTrackMetadata(artist, title) {
  const cacheKey = `${normalizeMusicText(artist)}|${normalizeMusicText(title)}`;
  const cached = metadataCache.get(cacheKey);
  if (cached && Date.now() - cached.at < METADATA_CACHE_TTL_MS) {
    return { album: cached.album, albumArt: cached.albumArt };
  }

  // Run both providers and keep the higher-scoring match
  const [itunesHit, deezerHit] = await Promise.all([
    searchItunes(artist, title),
    searchDeezer(artist, title),
  ]);

  let best = null;
  if (itunesHit && deezerHit) {
    best = itunesHit.score >= deezerHit.score ? itunesHit : deezerHit;
  } else {
    best = itunesHit || deezerHit;
  }

  const result = best
    ? { album: best.album || "", albumArt: best.albumArt || "" }
    : { album: "", albumArt: "" };

  metadataCache.set(cacheKey, { ...result, at: Date.now() });
  // Bound cache size
  if (metadataCache.size > 200) {
    const oldest = metadataCache.keys().next().value;
    metadataCache.delete(oldest);
  }
  return result;
}

/** Polls the local Spotify client. */
function pollLocalSpotify() {
  if (localSpotifyPollInFlight) return;
  localSpotifyPollInFlight = true;

  const done = () => {
    localSpotifyPollInFlight = false;
  };

  const isWin = process.platform === "win32";
  const isMac = process.platform === "darwin";

  if (isWin) {
    // Get the window titles of all active Spotify helper processes.
    // -NoProfile keeps PowerShell startup faster on each poll.
    const cmd = `powershell -NoProfile -NonInteractive -Command "Get-Process spotify -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowTitle -ne ''} | Select-Object -ExpandProperty MainWindowTitle"`;
    exec(cmd, { timeout: 2500, windowsHide: true }, async (err, stdout) => {
      try {
        if (err || !stdout.trim()) {
          if (localTrack.isPlaying) localTrack.isPlaying = false;
          return;
        }

        const titles = stdout
          .split(/\r?\n/)
          .map((t) => t.trim())
          .filter(Boolean);

        // Filter out processes that just have the static name "Spotify" (which means paused).
        const activeTitle =
          titles.find((t) => t.toLowerCase() !== "spotify") || titles[0] || "";

        if (!activeTitle || activeTitle.toLowerCase() === "spotify") {
          localTrack.isPlaying = false;
          return;
        }

        if (activeTitle !== lastPolledTitle) {
          lastPolledTitle = activeTitle;

          // Spotify uses "Artist - Song Name" (split at first hyphen)
          const parts = activeTitle.split(" - ");
          let artist = "Unknown Artist";
          let name = activeTitle;
          if (parts.length >= 2) {
            artist = parts[0].trim();
            name = parts.slice(1).join(" - ").trim();
          }

          // Publish title immediately so the card can switch before artwork loads.
          localTrack = {
            id: `local-${Date.now()}`,
            name,
            artist,
            album: "",
            albumArt: "",
            isPlaying: true,
            durationMs: 0,
            progressMs: 0,
          };

          const metadata = await fetchTrackMetadata(artist, name);
          if (lastPolledTitle === activeTitle) {
            localTrack.album = metadata.album;
            localTrack.albumArt = metadata.albumArt;
          }
        } else {
          localTrack.isPlaying = true;
        }
      } finally {
        done();
      }
    });
  } else if (isMac) {
    const cmd = `osascript -e 'if application "Spotify" is running then tell application "Spotify" to player state & "|||" & artist of current track & "|||" & name of current track' 2>/dev/null`;
    exec(cmd, { timeout: 2500 }, async (err, stdout) => {
      try {
        if (err || !stdout.trim()) {
          localTrack.isPlaying = false;
          return;
        }
        const parts = stdout.trim().split("|||");
        if (parts.length < 3) {
          localTrack.isPlaying = false;
          return;
        }
        const state = parts[0]; // "playing", "paused"
        const artist = parts[1];
        const name = parts[2];
        const isPlaying = state === "playing";
        const songKey = `${artist}-${name}`;

        if (songKey !== lastPolledTitle) {
          lastPolledTitle = songKey;
          // Publish title immediately; fill art async.
          localTrack = {
            id: `local-${Date.now()}`,
            name,
            artist,
            album: "",
            albumArt: "",
            isPlaying,
            durationMs: 0,
            progressMs: 0,
          };
          const metadata = await fetchTrackMetadata(artist, name);
          if (lastPolledTitle === songKey) {
            localTrack.album = metadata.album;
            localTrack.albumArt = metadata.albumArt;
          }
        } else {
          localTrack.isPlaying = isPlaying;
        }
      } finally {
        done();
      }
    });
  } else {
    done();
  }
}

// Start background window-title polling (fast enough for near-instant song switches).
setInterval(pollLocalSpotify, LOCAL_SPOTIFY_POLL_MS);
// Kick once on boot so the first track appears ASAP.
setTimeout(pollLocalSpotify, 250);

/**
 * Resolve the folder that contains the built Vite app (dist/index.html).
 * Dev launch: <repo>/dist
 */
function getDistPath() {
  return path.join(__dirname, "..", "dist");
}

function getIndexPath() {
  return path.join(getDistPath(), "index.html");
}

function getPreloadPath() {
  return path.join(__dirname, "preload.cjs");
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
    case ".cjs":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".ico":
      return "image/x-icon";
    default:
      return "text/plain; charset=utf-8";
  }
}

function sendMissingBuild(res) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`
    <html>
      <body style="margin:0;font-family:system-ui;background:#0e0e12;color:white;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center">
        <div>
          <h1 style="margin:0 0 12px;font-size:28px">Stream Control</h1>
          <p style="margin:0 0 8px;color:rgba(255,255,255,.7)">The app hasn't been built yet.</p>
          <p style="margin:0;color:rgba(255,255,255,.45)">Run <code>npm run build</code> first, or use <strong>Launch Stream Control.bat</strong>.</p>
        </div>
      </body>
    </html>
  `);
}

function startLocalServer() {
  const distPath = getDistPath();
  const indexPath = getIndexPath();

  if (server && server.listening) {
    return Promise.resolve(`http://${HOST}:${PORT}/`);
  }

  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      // Add standard CORS headers.
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS"
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, X-Stream-Control-Key, X-Api-Key"
      );

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

      // Local Spotify track API.
      if (url.pathname === "/api/local-track") {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(localTrack));
        return;
      }

      // Live status (viewers / uptime) for dashboard OBS Control.
      if (url.pathname === "/api/live-status" && req.method === "GET") {
        void (async () => {
          try {
            res.setHeader("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate");
            const twitch = normalizeChannel(url.searchParams.get("twitch") || "");
            const kick = normalizeChannel(url.searchParams.get("kick") || "");
            const [twitchStatus, kickStatus] = await Promise.all([
              twitch
                ? fetchTwitchLive(twitch).catch((e) => ({
                    live: false,
                    error: e instanceof Error ? e.message : String(e),
                  }))
                : Promise.resolve(null),
              kick
                ? fetchKickLive(kick).catch((e) => ({
                    live: false,
                    error: e instanceof Error ? e.message : String(e),
                  }))
                : Promise.resolve(null),
            ]);
            sendJson(res, 200, {
              ok: true,
              at: new Date().toISOString(),
              twitch: twitch
                ? {
                    channel: twitch,
                    live: Boolean(twitchStatus?.live),
                    viewers: Number(twitchStatus?.viewers) || 0,
                    title: twitchStatus?.title || "",
                    game: twitchStatus?.game || "",
                    displayName: twitchStatus?.displayName || twitch,
                    startedAt: twitchStatus?.startedAt || twitchStatus?.id || "",
                    error: twitchStatus?.error || null,
                  }
                : null,
              kick: kick
                ? {
                    channel: kick,
                    live: Boolean(kickStatus?.live),
                    viewers: Number(kickStatus?.viewers) || 0,
                    title: kickStatus?.title || "",
                    game: kickStatus?.game || "",
                    displayName: kickStatus?.displayName || kick,
                    startedAt: kickStatus?.startedAt || "",
                    error: kickStatus?.error || null,
                  }
                : null,
            });
          } catch (e) {
            sendJson(res, 500, {
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        })();
        return;
      }

      // streamer.bot bridge API (async).
      if (url.pathname.startsWith("/api/bridge/")) {
        void handleBridgeRequest(req, res, url).then((handled) => {
          if (!handled) {
            sendJson(res, 404, { ok: false, error: "Not found" });
          }
        });
        return;
      }

      // Inside asar packages, existsSync works; createReadStream also works
      // for files inside app.asar via Electron's patched fs.
      let indexExists = false;
      try {
        indexExists = fs.existsSync(indexPath);
      } catch {
        indexExists = false;
      }
      if (!indexExists) {
        sendMissingBuild(res);
        return;
      }

      let requestPath = decodeURIComponent(url.pathname);

      if (requestPath === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        fs.createReadStream(indexPath)
          .on("error", () => sendMissingBuild(res))
          .pipe(res);
        return;
      }

      const safePath = path.normalize(requestPath).replace(/^([.][.][/\\])+/, "");
      const filePath = path.join(distPath, safePath);

      // startsWith can fail across asar path forms — only allow paths under dist.
      const underDist =
        filePath === distPath ||
        filePath.startsWith(distPath + path.sep) ||
        filePath.startsWith(distPath + "/");

      let isFile = false;
      try {
        isFile = underDist && fs.existsSync(filePath) && fs.statSync(filePath).isFile();
      } catch {
        isFile = false;
      }

      if (!isFile) {
        // SPA fallback
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        fs.createReadStream(indexPath)
          .on("error", () => sendMissingBuild(res))
          .pipe(res);
        return;
      }

      res.writeHead(200, { "Content-Type": contentType(filePath) });
      fs.createReadStream(filePath)
        .on("error", () => {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Not found");
        })
        .pipe(res);
    });

    server.once("error", reject);
    server.listen(PORT, HOST, () => {
      server.removeListener("error", reject);
      resolve(`http://${HOST}:${PORT}/`);
    });
  });
}

let popoutWin = null;

/**
 * Open the chat reader as a native in-app window.
 * Resizable, always-on-top, and reused if already open.
 */
function openPopoutWindow(url) {
  // Only allow URLs served by our own local server.
  if (typeof url !== "string" || !url.startsWith(`http://${HOST}:${PORT}/`)) {
    return false;
  }

  if (popoutWin && !popoutWin.isDestroyed()) {
    popoutWin.loadURL(url);
    popoutWin.show();
    popoutWin.focus();
    return true;
  }

  popoutWin = new BrowserWindow({
    width: 360,
    height: 640,
    minWidth: 240,
    minHeight: 320,
    resizable: true,
    alwaysOnTop: true,
    frame: false, // no OS title bar — the entire window is the chat
    backgroundColor: "#0e0e12",
    autoHideMenuBar: true,
    title: "Chat Reader",
    skipTaskbar: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Keep it pinned above all applications (including fullscreen games & DWM topmost layers)
  popoutWin.setAlwaysOnTop(true, "screen-saver", 1);
  popoutWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Re-enforce always-on-top after moving/resizing or blur so OS drag/drop operations don't drop it
  const enforceTop = () => {
    if (popoutWin && !popoutWin.isDestroyed()) {
      popoutWin.setAlwaysOnTop(true, "screen-saver", 1);
    }
  };
  popoutWin.on("move", enforceTop);
  popoutWin.on("moved", enforceTop);
  popoutWin.on("resize", enforceTop);
  popoutWin.on("blur", enforceTop);
  popoutWin.on("focus", enforceTop);

  popoutWin.on("closed", () => {
    popoutWin = null;
    broadcastPopoutStatus();
  });

  popoutWin.loadURL(url);
  broadcastPopoutStatus();
  return true;
}

function broadcastPopoutStatus() {
  const isOpen = Boolean(popoutWin && !popoutWin.isDestroyed());
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send("popout:status", isOpen);
  });
}

function closePopoutWindow() {
  if (popoutWin && !popoutWin.isDestroyed()) {
    popoutWin.close();
    popoutWin = null;
    broadcastPopoutStatus();
    return true;
  }
  return false;
}

function isPopoutWindowOpen() {
  return Boolean(popoutWin && !popoutWin.isDestroyed());
}

ipcMain.handle("open-popout", (_event, url) => openPopoutWindow(url));
ipcMain.handle("close-popout", () => closePopoutWindow());
ipcMain.handle("is-popout-open", () => isPopoutWindowOpen());

ipcMain.handle("bridge:set-config", (_event, cfg) => {
  bridgeConfig = {
    apiKey: String(cfg?.apiKey || ""),
    allowUnauthed: cfg?.allowUnauthed !== false,
  };
  return true;
});

ipcMain.handle("bridge:get-config", () => ({ ...bridgeConfig }));

ipcMain.handle("webhooks:list", () => webhookConfigs.map(publicWebhook));

function normalizeWebhookConfig(input, existing) {
  const platform = input?.platform === "kick" ? "kick" : "twitch";
  const bool = (value, fallback) =>
    typeof value === "boolean" ? value : fallback;

  return {
    id: existing?.id || randomUUID(),
    type: "discord-live",
    name: String(input?.name || "Discord live announcement").trim(),
    enabled: Boolean(input?.enabled),
    platform,
    channel: normalizeChannel(input?.channel),
    discordWebhookUrl: String(input?.discordWebhookUrl || "").trim(),

    // Message body above the embed
    message: String(
      input?.message ?? existing?.message ?? DEFAULT_MESSAGE
    ),
    mentionEveryone: bool(input?.mentionEveryone, existing?.mentionEveryone ?? false),

    // Discord webhook identity (shows as the "bot" in the channel)
    botUsername: String(input?.botUsername ?? existing?.botUsername ?? "").trim(),
    botAvatarUrl: String(input?.botAvatarUrl ?? existing?.botAvatarUrl ?? "").trim(),

    // Embed style + every editable text line
    useEmbed: bool(input?.useEmbed, existing?.useEmbed ?? true),
    embedTitle: String(
      input?.embedTitle ?? existing?.embedTitle ?? DEFAULT_EMBED_TITLE
    ),
    embedDescription: String(
      input?.embedDescription ?? existing?.embedDescription ?? DEFAULT_EMBED_DESCRIPTION
    ),
    embedAuthor: String(
      input?.embedAuthor ?? existing?.embedAuthor ?? DEFAULT_EMBED_AUTHOR
    ),
    embedFooter: String(
      input?.embedFooter ?? existing?.embedFooter ?? DEFAULT_EMBED_FOOTER
    ),
    embedColor: String(
      input?.embedColor ??
        existing?.embedColor ??
        (platform === "kick" ? "#53FC18" : "#9146FF")
    ).trim(),
    gameFieldLabel: String(
      input?.gameFieldLabel ?? existing?.gameFieldLabel ?? DEFAULT_GAME_FIELD_LABEL
    ),
    viewersFieldLabel: String(
      input?.viewersFieldLabel ??
        existing?.viewersFieldLabel ??
        DEFAULT_VIEWERS_FIELD_LABEL
    ),
    watchFieldLabel: String(
      input?.watchFieldLabel ?? existing?.watchFieldLabel ?? DEFAULT_WATCH_FIELD_LABEL
    ),
    watchFieldValue: String(
      input?.watchFieldValue ?? existing?.watchFieldValue ?? DEFAULT_WATCH_FIELD_VALUE
    ),

    // Visual toggles
    showProfileImage: bool(input?.showProfileImage, existing?.showProfileImage ?? true),
    showBanner: bool(input?.showBanner, existing?.showBanner ?? true),
    showStreamPreview: bool(
      input?.showStreamPreview,
      existing?.showStreamPreview ?? false
    ),
    showGame: bool(input?.showGame, existing?.showGame ?? true),
    showViewers: bool(input?.showViewers, existing?.showViewers ?? false),
    showWatchLink: bool(input?.showWatchLink, existing?.showWatchLink ?? true),
    showTimestamp: bool(input?.showTimestamp, existing?.showTimestamp ?? true),

    createdAt: existing?.createdAt || new Date().toISOString(),
    lastAnnouncedStreamId: existing?.lastAnnouncedStreamId || "",
    lastSentAt: existing?.lastSentAt || "",
  };
}

ipcMain.handle("webhooks:save", (_event, input) => {
  const existing = webhookConfigs.find((item) => item.id === input?.id);
  const config = normalizeWebhookConfig(input, existing);

  if (existing) {
    webhookConfigs = webhookConfigs.map((item) =>
      item.id === config.id ? config : item
    );
  } else {
    webhookConfigs = [...webhookConfigs, config];
  }
  persistWebhookConfigs();
  setWebhookStatus(config.id, {
    state: config.enabled ? "idle" : "disabled",
    message: config.enabled ? "Saved; waiting for status check" : "Disabled",
  });
  if (config.enabled) setTimeout(() => void checkLiveWebhook(config, true), 200);
  return publicWebhook(config);
});

ipcMain.handle("webhooks:delete", (_event, id) => {
  webhookConfigs = webhookConfigs.filter((item) => item.id !== id);
  webhookStatuses.delete(id);
  persistWebhookConfigs();
  broadcastWebhookUpdate();
  return true;
});

ipcMain.handle("webhooks:test", async (_event, input) => {
  try {
    const existing = webhookConfigs.find((item) => item.id === input?.id);
    const config = normalizeWebhookConfig(
      {
        ...existing,
        ...input,
        // Ensure test always has the URL even if only partial form data
        discordWebhookUrl:
          input?.discordWebhookUrl || existing?.discordWebhookUrl || "",
      },
      existing
    );
    await postDiscordWebhook(config, {}, true);
    return {
      ok: true,
      message:
        "Test announcement sent — check Discord for the styled embed (profile + banner when available).",
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle("webhooks:preview-profile", async (_event, input) => {
  try {
    const platform = input?.platform === "kick" ? "kick" : "twitch";
    const channel = normalizeChannel(input?.channel);
    if (!channel) throw new Error("Enter a channel name first");
    const profile = await fetchChannelProfile(platform, channel);
    return {
      ok: true,
      profile: {
        displayName: profile.displayName,
        login: profile.login,
        profileImage: profile.profileImage,
        bannerImage: profile.bannerImage,
        description: profile.description,
        url: profile.url,
        live: profile.live,
        title: profile.title,
        game: profile.game,
      },
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle("webhooks:check", async (_event, id) => {
  const config = webhookConfigs.find((item) => item.id === id);
  if (!config) return { ok: false, message: "Webhook was not found" };
  await checkLiveWebhook(config, true);
  return { ok: true };
});

/** Primary dashboard window — reused when a second instance is launched. */
let mainWindow = null;

async function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  const win = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#0e0e12",
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#0e0e12",
      symbolColor: "#ffffff",
      height: 36,
    },
    title: "Stream Control",
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  win.once("ready-to-show", () => {
    if (!win.isDestroyed()) win.show();
  });

  win.webContents.setWindowOpenHandler(({ url, frameName }) => {
    // If it's our chat popout, route it to the managed native window.
    if (frameName === "ChatPopout") {
      openPopoutWindow(url);
      return { action: "deny" };
    }
    // Otherwise open in system browser.
    shell.openExternal(url);
    return { action: "deny" };
  });

  const appUrl = await startLocalServer();
  await win.loadURL(appUrl);
  return win;
}

// Single instance — second launch focuses the existing window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else {
      void createWindow();
    }
  });

  app.whenReady().then(() => {
    startWebhookMonitor();
    createWindow().catch((error) => {
      dialog.showErrorBox(
        "Stream Control couldn't start",
        `Desktop server error: ${error && error.message ? error.message : String(error)}\n\nIf port ${PORT} is already in use, close the other app using it and try again.`
      );
      app.quit();
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  globalShortcut.unregisterAll();
  if (webhookTimer) clearInterval(webhookTimer);
  if (server) {
    try {
      server.close();
    } catch {
      // ignore
    }
  }
  if (process.platform !== "darwin") app.quit();
});
