/**
 * Spotify Web API client for the "Now Playing" feature.
 *
 * Uses Authorization Code + PKCE (browser-safe — no client secret).
 * Tokens are stored in localStorage for the dashboard. The OBS
 * Now Playing overlay can also boot with a refresh token embedded in
 * its URL so it works as a fully independent Browser Source (OBS has
 * its own storage, separate from your normal browser).
 *
 * Scope required: `user-read-currently-playing`, `user-read-playback-state`.
 */
import { Emitter } from "./Emitter";

const SPOTIFY_AUTH = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN = "https://accounts.spotify.com/api/token";
const SPOTIFY_NOW_PLAYING = "https://api.spotify.com/v1/me/player/currently-playing";
/** How often we hit Spotify currently-playing. Lower = snappier Now Playing. */
const POLL_INTERVAL_MS = 2_000;
const SCOPES = ["user-read-currently-playing", "user-read-playback-state"];
const TOKEN_KEY = "sc:spotify:tokens";
const PENDING_KEY = "sc:spotify:pending";
const DEFAULT_CALLBACK_PATH = "/auth/spotify/callback";

/** Minimal subset of what Spotify returns — extend as needed. */
export interface SpotifyTrack {
  id: string;
  name: string;
  artist: string;
  album: string;
  albumArt: string;
  isPlaying: boolean;
  durationMs: number;
  progressMs: number;
}

export type SpotifyAuthState = "idle" | "connecting" | "authenticated" | "error";

export interface StoredTokens {
  access: string;
  refresh: string;
  /** Unix ms when `access` expires. */
  expiresAt: number;
}

interface PendingAuth {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  returnPath: string;
}

export interface SpotifyClientOptions {
  clientId: string;
  /** Optional custom redirect URI entered by the user in settings. */
  redirectUri?: string;
  /**
   * Optional seed tokens (used by the OBS overlay, which embeds the
   * refresh token in its URL so it doesn't need the dashboard's storage).
   */
  seedRefreshToken?: string;
  /** Persist tokens to localStorage. Defaults to true for the dashboard. */
  persist?: boolean;
}

function randomString(len = 64): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) =>
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"[b % 66]
  ).join("");
}

async function sha256Base64Url(str: string): Promise<string> {
  const data = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Suggested redirect URI for the current host. */
export function computeRecommendedRedirectUri(): string {
  return new URL(DEFAULT_CALLBACK_PATH, window.location.origin).toString();
}

function normalizeRedirectUri(input?: string): string {
  const trimmed = input?.trim();
  if (!trimmed) return computeRecommendedRedirectUri();
  try {
    return new URL(trimmed).toString();
  } catch {
    return trimmed;
  }
}

export class SpotifyClient extends Emitter {
  private clientId: string;
  private redirectUri: string;
  private tokens: StoredTokens | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastTrackKey: string | null = null;
  private authState: SpotifyAuthState = "idle";
  private persist: boolean;
  private lastError: string | null = null;

  constructor(opts: SpotifyClientOptions) {
    super();
    this.clientId = opts.clientId;
    this.redirectUri = normalizeRedirectUri(opts.redirectUri);
    this.persist = opts.persist !== false;

    if (opts.seedRefreshToken) {
      this.tokens = {
        access: "",
        refresh: opts.seedRefreshToken,
        expiresAt: 0,
      };
      this.setAuthState("authenticated");
    } else if (this.persist) {
      this.loadTokens();
    }
  }

  setClientId(id: string): void {
    if (id === this.clientId) return;
    this.clientId = id;
    this.clearTokens();
    this.setAuthState("idle");
  }

  setRedirectUri(uri: string): void {
    this.redirectUri = normalizeRedirectUri(uri);
  }

  getAuthState(): SpotifyAuthState {
    return this.authState;
  }

  getRefreshToken(): string | null {
    return this.tokens?.refresh || null;
  }

  getRedirectUri(): string {
    return this.redirectUri;
  }

  /** Last error message (for debugging the overlay). */
  getLastError(): string | null {
    return this.lastError;
  }

  onError(cb: (message: string) => void): () => void {
    return this.on<string>("error", cb);
  }

  private setError(message: string): void {
    this.lastError = message;
    this.emit<string>("error", message);
  }

  onAuth(cb: (state: SpotifyAuthState) => void): () => void {
    return this.on<SpotifyAuthState>("auth", cb);
  }

  onTrack(cb: (track: SpotifyTrack | null) => void): () => void {
    return this.on<SpotifyTrack | null>("track", cb);
  }

  /**
   * If the current URL contains an OAuth `code`, exchange it for tokens.
   * Call this once at dashboard startup.
   */
  async handleCallback(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state) return;

    const pendingRaw = sessionStorage.getItem(PENDING_KEY);
    if (!pendingRaw) return;
    const pending: PendingAuth = JSON.parse(pendingRaw);
    sessionStorage.removeItem(PENDING_KEY);

    if (pending.state !== state) {
      this.setAuthState("error");
      return;
    }

    this.redirectUri = normalizeRedirectUri(pending.redirectUri);
    this.setAuthState("connecting");
    try {
      const tokens = await this.exchangeCode(code, pending.codeVerifier, this.redirectUri);
      this.saveTokens(tokens);
      this.setAuthState("authenticated");

      const returnPath = pending.returnPath?.trim() || "/";
      window.history.replaceState({}, "", returnPath);
    } catch {
      this.setAuthState("error");
    }
  }

  /** Kick off the OAuth PKCE flow — redirects the user to Spotify. */
  async login(): Promise<void> {
    if (!this.clientId) {
      this.setAuthState("error");
      return;
    }

    const redirectUri = this.getRedirectUri();
    const state = randomString(32);
    const codeVerifier = randomString(64);
    const codeChallenge = await sha256Base64Url(codeVerifier);

    sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({
        state,
        codeVerifier,
        redirectUri,
        returnPath: window.location.pathname || "/",
      } satisfies PendingAuth)
    );

    const url = new URL(SPOTIFY_AUTH);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", SCOPES.join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("code_challenge", codeChallenge);
    window.location.href = url.toString();
  }

  logout(): void {
    this.stopPolling();
    this.clearTokens();
    this.emit<SpotifyTrack | null>("track", null);
    this.setAuthState("idle");
  }

  startPolling(): void {
    if (this.pollTimer) return;
    void this.poll();
    this.pollTimer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
  }

  stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  /* ---------------- internals ---------------- */

  private setAuthState(state: SpotifyAuthState): void {
    if (state === this.authState) return;
    this.authState = state;
    this.emit<SpotifyAuthState>("auth", state);
  }

  private loadTokens(): void {
    try {
      const raw = localStorage.getItem(TOKEN_KEY);
      if (raw) this.tokens = JSON.parse(raw);
    } catch {
      /* ignore */
    }
    if (this.tokens?.refresh) this.setAuthState("authenticated");
  }

  private saveTokens(t: StoredTokens): void {
    this.tokens = t;
    if (!this.persist) return;
    try {
      localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
    } catch {
      /* ignore */
    }
  }

  private clearTokens(): void {
    this.tokens = null;
    if (!this.persist) return;
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }

  private async exchangeCode(
    code: string,
    codeVerifier: string,
    redirectUri: string
  ): Promise<StoredTokens> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: this.clientId,
      code_verifier: codeVerifier,
    });
    const res = await fetch(SPOTIFY_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
    const data = await res.json();
    return {
      access: data.access_token,
      refresh: data.refresh_token ?? "",
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.tokens?.refresh) throw new Error("no refresh token");
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.tokens.refresh,
      client_id: this.clientId,
    });
    const res = await fetch(SPOTIFY_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) {
      let detail = "";
      try {
        const err = await res.json();
        detail = err.error_description || err.error || "";
      } catch {
        /* ignore */
      }
      const msg = `Token refresh failed (${res.status})${detail ? `: ${detail}` : ""}`;
      this.setError(msg);
      throw new Error(msg);
    }
    const data = await res.json();
    this.lastError = null;
    this.saveTokens({
      access: data.access_token,
      refresh: data.refresh_token ?? this.tokens.refresh,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    });
  }

  private async getAccessToken(): Promise<string> {
    if (!this.tokens) throw new Error("no tokens");
    if (!this.tokens.access || Date.now() >= this.tokens.expiresAt) {
      await this.refreshAccessToken();
    }
    return this.tokens.access;
  }

  private async poll(): Promise<void> {
    try {
      const token = await this.getAccessToken();
      const res = await fetch(SPOTIFY_NOW_PLAYING, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 204 || res.status === 202) {
        this.emitTrack(null);
        return;
      }
      if (res.status === 401) {
        await this.refreshAccessToken();
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.item) {
        this.emitTrack(null);
        return;
      }
      const images = data.item.album?.images ?? [];
      const largestImage = images[0]?.url ?? "";
      const artists: string = (data.item.artists ?? [])
        .map((a: { name: string }) => a.name)
        .join(", ");
      this.lastError = null;
      this.emitTrack({
        id: data.item.id,
        name: data.item.name,
        artist: artists,
        album: data.item.album?.name ?? "",
        albumArt: largestImage,
        isPlaying: Boolean(data.is_playing),
        durationMs: data.item.duration_ms,
        progressMs: data.progress_ms ?? 0,
      });
    } catch (e) {
      this.setError(e instanceof Error ? e.message : String(e));
      /* will retry next poll */
    }
  }

  private emitTrack(track: SpotifyTrack | null): void {
    const key = track
      ? `${track.id}:${track.isPlaying}:${Math.floor(track.progressMs / 2000)}`
      : "null";
    if (key === this.lastTrackKey) return;
    this.lastTrackKey = key;
    this.emit<SpotifyTrack | null>("track", track);
  }
}
