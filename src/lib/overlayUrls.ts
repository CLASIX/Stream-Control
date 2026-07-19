/**
 * Helpers for building OBS Browser Source URLs.
 *
 * Chat and Now Playing are intentionally separate sources so you can
 * position and size them independently in OBS:
 *
 * Chat: ?overlay=chat&twitch=…&kick=…
 * Now Playing: ?overlay=now-playing&client=…&refresh=…&mode=…
 */

export type OverlayKind = "chat" | "now-playing" | "popout";

function baseUrl(): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}`;
}

export interface ChatOverlayOptions {
  twitch?: string;
  kick?: string;
  size?: number;
  showTimestamps?: boolean;
  showPlatform?: boolean;
  /** Feed pinned to "top" (grows down) or "bottom" (grows up). */
  anchor?: "top" | "bottom";
  /** Side messages slide in from. */
  from?: "left" | "right";
  /** Font id from CHAT_FONTS. */
  font?: string;
  /** Comma-separated usernames to hide. */
  block?: string;
  /** Seconds a message stays visible before fading out (0 = never). */
  ttl?: number;
  /** Platform filter: all | twitch | kick */
  platformFilter?: "all" | "twitch" | "kick";
  /** Names that count as @mentions / self (comma-separated). */
  highlightNames?: string;
  highlightFirst?: boolean;
  highlightMentions?: boolean;
  highlightSelf?: boolean;
  useRoleColors?: boolean;
}

function appendChatHighlightParams(
  p: URLSearchParams,
  opts: ChatOverlayOptions
): void {
  if (opts.platformFilter && opts.platformFilter !== "all") {
    p.set("pf", opts.platformFilter);
  }
  if (opts.highlightNames?.trim()) p.set("hl", opts.highlightNames.trim());
  // Explicit 0/1 so defaults stay on when omitted
  if (opts.highlightFirst === false) p.set("first", "0");
  if (opts.highlightMentions === false) p.set("mention", "0");
  if (opts.highlightSelf === false) p.set("self", "0");
  if (opts.useRoleColors === false) p.set("roles", "0");
}

export function buildChatOverlayUrl(opts: ChatOverlayOptions): string {
  const p = new URLSearchParams();
  p.set("overlay", "chat");
  if (opts.twitch?.trim()) p.set("twitch", opts.twitch.trim());
  if (opts.kick?.trim()) p.set("kick", opts.kick.trim());
  p.set("size", String(opts.size ?? 16));
  if (opts.showTimestamps) p.set("ts", "1");
  p.set("icons", opts.showPlatform === false ? "0" : "1");
  p.set("anchor", opts.anchor ?? "top");
  p.set("from", opts.from ?? "left");
  p.set("font", opts.font ?? "default");
  if (opts.block?.trim()) p.set("block", opts.block.trim());
  p.set("ttl", String(opts.ttl ?? 0));
  appendChatHighlightParams(p, opts);
  p.set("bg", "transparent");
  return `${baseUrl()}?${p.toString()}`;
}

export function buildPopoutChatUrl(opts: ChatOverlayOptions): string {
  const p = new URLSearchParams();
  p.set("overlay", "popout");
  if (opts.twitch?.trim()) p.set("twitch", opts.twitch.trim());
  if (opts.kick?.trim()) p.set("kick", opts.kick.trim());
  p.set("size", String(opts.size ?? 13));
  p.set("font", opts.font ?? "default");
  p.set("ts", opts.showTimestamps === false ? "0" : "1");
  p.set("icons", opts.showPlatform === false ? "0" : "1");
  if (opts.block?.trim()) p.set("block", opts.block.trim());
  appendChatHighlightParams(p, opts);
  return `${baseUrl()}?${p.toString()}`;
}

export interface NowPlayingOverlayOptions {
  clientId: string;
  /** Spotify refresh token — lets the OBS source auth independently. */
  refreshToken?: string;
  mode?: "spotify-api" | "local-player";
}

/**
 * Build the Now Playing overlay URL.
 *
 * The card fills 100% of the Browser Source dimensions — 1:1 pixel
 * mapping means zero blur. Set the OBS source to the size you want
 * the card to be (e.g. 800×120).
 */
export function buildNowPlayingOverlayUrl(opts: NowPlayingOverlayOptions): string {
  const p = new URLSearchParams();
  p.set("overlay", "now-playing");
  if (opts.clientId.trim()) p.set("client", opts.clientId.trim());
  if (opts.refreshToken?.trim()) p.set("refresh", opts.refreshToken.trim());
  p.set("mode", opts.mode ?? "local-player");
  p.set("bg", "transparent");
  return `${baseUrl()}?${p.toString()}`;
}

/** Detect which overlay (if any) the current URL is asking for. */
export function detectOverlay(params: URLSearchParams): OverlayKind | null {
  const explicit = params.get("overlay");
  if (explicit === "chat" || explicit === "now-playing" || explicit === "popout")
    return explicit;

  // Back-compat with older query shapes.
  if (params.has("spotify")) return "now-playing";
  if (params.has("twitch") || params.has("kick")) return "chat";
  return null;
}
