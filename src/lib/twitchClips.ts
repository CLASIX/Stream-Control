/**
 * Twitch Helix helpers for the Clips module.
 *
 * Create Clip requires a user access token with `clips:edit`.
 *
 * Auth uses Device Code Flow (no redirect URI / HTTPS required) — ideal
 * for the desktop app when Twitch rejects http://127.0.0.1 redirects.
 * Docs: https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#device-code-grant-flow
 */

const TWITCH_TOKEN = "https://id.twitch.tv/oauth2/token";
const TWITCH_DEVICE = "https://id.twitch.tv/oauth2/device";
const TWITCH_HELIX = "https://api.twitch.tv/helix";
const SCOPES = ["clips:edit", "chat:read"];

export interface TwitchClipTokens {
  access: string;
  refresh: string;
  expiresAt: number;
  userId?: string;
  login?: string;
  displayName?: string;
}

export interface TwitchClip {
  id: string;
  url: string;
  embed_url: string;
  broadcaster_id: string;
  broadcaster_name: string;
  creator_name: string;
  title: string;
  view_count: number;
  created_at: string;
  thumbnail_url: string;
  duration: number;
  vod_offset: number | null;
}

export interface DeviceCodeSession {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresAt: number;
  intervalMs: number;
  clientId: string;
}

/** Start Device Code flow — no redirect URI needed. */
export async function startTwitchDeviceLogin(
  clientId: string
): Promise<DeviceCodeSession> {
  const cid = clientId.trim();
  if (!cid) throw new Error("Enter a Twitch Client ID first");

  const body = new URLSearchParams({
    client_id: cid,
    scopes: SCOPES.join(" "),
  });

  const res = await fetch(TWITCH_DEVICE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Device auth failed (${res.status}): ${t}`);
  }

  const data = await res.json();
  // Twitch returns interval in seconds
  const intervalSec = Math.max(3, Number(data.interval) || 5);
  const expiresIn = Number(data.expires_in) || 1800;

  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri || "https://www.twitch.tv/activate",
    verificationUriComplete: data.verification_uri_complete,
    expiresAt: Date.now() + expiresIn * 1000,
    intervalMs: intervalSec * 1000,
    clientId: cid,
  };
}

/**
 * Poll until the user authorizes (or timeout / deny).
 * Returns tokens on success.
 */
export async function pollTwitchDeviceLogin(
  session: DeviceCodeSession,
  opts?: { signal?: AbortSignal; onTick?: (secondsLeft: number) => void }
): Promise<TwitchClipTokens> {
  let interval = session.intervalMs;

  while (Date.now() < session.expiresAt) {
    if (opts?.signal?.aborted) throw new Error("Login cancelled");

    const secondsLeft = Math.max(
      0,
      Math.ceil((session.expiresAt - Date.now()) / 1000)
    );
    opts?.onTick?.(secondsLeft);

    const body = new URLSearchParams({
      client_id: session.clientId,
      device_code: session.deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });

    const res = await fetch(TWITCH_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: opts?.signal,
    });

    const data = await res.json().catch(() => ({} as Record<string, unknown>));

    if (res.ok && data.access_token) {
      const tokens: TwitchClipTokens = {
        access: String(data.access_token),
        refresh: String(data.refresh_token ?? ""),
        expiresAt:
          Date.now() + ((Number(data.expires_in) || 14400) - 60) * 1000,
      };
      const user = await fetchUsers(session.clientId, tokens.access);
      if (user) {
        tokens.userId = user.id;
        tokens.login = user.login;
        tokens.displayName = user.display_name;
      }
      return tokens;
    }

    // Twitch device-flow error codes live in `message`
    const msg = String(data.message || "");
    if (msg === "authorization_pending") {
      await sleep(interval, opts?.signal);
      continue;
    }
    if (msg === "slow_down") {
      interval += 2000;
      await sleep(interval, opts?.signal);
      continue;
    }
    if (msg === "access_denied") {
      throw new Error("Authorization denied on Twitch");
    }
    if (msg === "expired_token") {
      throw new Error("Device code expired — try Connect again");
    }

    // Some responses use HTTP 400 for pending without a clean body
    if (res.status === 400 && !msg) {
      await sleep(interval, opts?.signal);
      continue;
    }

    throw new Error(msg || `Device token poll failed (${res.status})`);
  }

  throw new Error("Device code expired — try Connect again");
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Login cancelled"));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new Error("Login cancelled"));
      },
      { once: true }
    );
  });
}

/** @deprecated Redirect flow — prefer Device Code. Kept for optional use. */
export function computeTwitchClipsRedirectUri(): string {
  // Twitch allows http://localhost (not 127.0.0.1) without HTTPS in many cases.
  // Device Code is still preferred and needs no redirect at all.
  return "http://localhost:8080/auth/twitch/clips/callback";
}

async function refreshTokens(
  clientId: string,
  refresh: string
): Promise<TwitchClipTokens> {
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: refresh,
  });
  const res = await fetch(TWITCH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Twitch token refresh failed (${res.status})`);
  const data = await res.json();
  return {
    access: data.access_token,
    refresh: data.refresh_token ?? refresh,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
}

export async function ensureAccessToken(
  clientId: string,
  tokens: TwitchClipTokens
): Promise<TwitchClipTokens> {
  if (tokens.access && Date.now() < tokens.expiresAt) return tokens;
  if (!tokens.refresh) throw new Error("Twitch session expired — reconnect");
  const next = await refreshTokens(clientId, tokens.refresh);
  return {
    ...tokens,
    access: next.access,
    refresh: next.refresh,
    expiresAt: next.expiresAt,
  };
}

async function helixGet(
  clientId: string,
  access: string,
  path: string
): Promise<any> {
  const res = await fetch(`${TWITCH_HELIX}${path}`, {
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${access}`,
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Twitch API ${path} failed (${res.status}): ${t}`);
  }
  return res.json();
}

async function fetchUsers(
  clientId: string,
  access: string,
  login?: string
): Promise<{ id: string; login: string; display_name: string } | null> {
  const path = login
    ? `/users?login=${encodeURIComponent(login)}`
    : "/users";
  const data = await helixGet(clientId, access, path);
  return data?.data?.[0] ?? null;
}

export async function resolveBroadcasterId(
  clientId: string,
  tokens: TwitchClipTokens,
  channelLogin: string
): Promise<{ tokens: TwitchClipTokens; broadcasterId: string; login: string }> {
  let t = await ensureAccessToken(clientId, tokens);
  const login = channelLogin.trim().toLowerCase().replace(/^#/, "");
  if (!login) throw new Error("Set your Twitch channel first (Chat Overlay)");
  const user = await fetchUsers(clientId, t.access, login);
  if (!user) throw new Error(`Twitch user “${login}” not found`);
  return { tokens: t, broadcasterId: user.id, login: user.login };
}

export async function createTwitchClip(
  clientId: string,
  tokens: TwitchClipTokens,
  broadcasterId: string,
  hasDelay = false
): Promise<{ tokens: TwitchClipTokens; id: string; editUrl: string }> {
  let t = await ensureAccessToken(clientId, tokens);
  const url = new URL(`${TWITCH_HELIX}/clips`);
  url.searchParams.set("broadcaster_id", broadcasterId);
  if (hasDelay) url.searchParams.set("has_delay", "true");

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${t.access}`,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 404) {
      throw new Error(
        "Clip failed (404) — channel must be live (or just went offline)."
      );
    }
    throw new Error(`Create clip failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  const clip = data?.data?.[0];
  if (!clip?.id) throw new Error("Twitch returned no clip id");
  return {
    tokens: t,
    id: clip.id,
    editUrl: clip.edit_url || `https://clips.twitch.tv/${clip.id}`,
  };
}

export async function getClipById(
  clientId: string,
  tokens: TwitchClipTokens,
  clipId: string
): Promise<{ tokens: TwitchClipTokens; clip: TwitchClip | null }> {
  let t = await ensureAccessToken(clientId, tokens);
  const data = await helixGet(
    clientId,
    t.access,
    `/clips?id=${encodeURIComponent(clipId)}`
  );
  return { tokens: t, clip: data?.data?.[0] ?? null };
}

export async function waitForClip(
  clientId: string,
  tokens: TwitchClipTokens,
  clipId: string,
  attempts = 8,
  delayMs = 1500
): Promise<{ tokens: TwitchClipTokens; clip: TwitchClip | null }> {
  let t = tokens;
  for (let i = 0; i < attempts; i++) {
    const result = await getClipById(clientId, t, clipId);
    t = result.tokens;
    if (result.clip) return result;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return { tokens: t, clip: null };
}

export async function listRecentClips(
  clientId: string,
  tokens: TwitchClipTokens,
  broadcasterId: string,
  first = 12
): Promise<{ tokens: TwitchClipTokens; clips: TwitchClip[] }> {
  let t = await ensureAccessToken(clientId, tokens);
  const data = await helixGet(
    clientId,
    t.access,
    `/clips?broadcaster_id=${encodeURIComponent(broadcasterId)}&first=${first}`
  );
  return { tokens: t, clips: data?.data ?? [] };
}

export function publicClipUrl(id: string): string {
  return `https://clips.twitch.tv/${id}`;
}
