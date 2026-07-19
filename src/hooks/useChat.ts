/**
 * Unified chat hook.
 *
 * Given a map of `platformId -> channel`, instantiates one connector per
 * platform (using the registry in `platforms/index.ts`), subscribes to
 * their `message` and `status` events, and exposes a merged message feed
 * plus per-platform connection statuses.
 *
 * Reconnects are handled inside each connector; this hook only tears
 * down on unmount or when `enabled` / channels change.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { PLATFORMS } from "../platforms";
import type { ChatMsg, ConnStatus, PlatformId } from "../types";

/** Cap the feed length so it never bloats during a long stream. */
const MAX_MESSAGES = 200;

export interface PlatformStatus {
  status: ConnStatus;
  error?: string;
}

export interface UseChatOptions {
  enabled: boolean;
  /** Map of platform id → channel slug/username/id. Empty strings are skipped. */
  channels: Partial<Record<PlatformId, string>>;
  /**
   * Usernames whose messages are dropped (case-insensitive).
   * Accepts a comma/newline separated string for convenience.
   */
  blacklist?: string;
  /** Changes when connection credentials change and forces a reconnect. */
  connectionKey?: string;
}

/** Parse a comma/newline separated blacklist into a lowercase Set. */
export function parseBlacklist(raw?: string): Set<string> {
  const set = new Set<string>();
  if (!raw) return set;
  for (const name of raw.split(/[\n,]+/)) {
    const clean = name.trim().toLowerCase().replace(/^@/, "");
    if (clean) set.add(clean);
  }
  return set;
}

export interface UseChatResult {
  messages: ChatMsg[];
  statuses: Partial<Record<PlatformId, PlatformStatus>>;
  clear: () => void;
}

export function useChat({ enabled, channels, blacklist, connectionKey = "" }: UseChatOptions): UseChatResult {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [statuses, setStatuses] = useState<Partial<Record<PlatformId, PlatformStatus>>>({});

  // Keep the parsed blacklist in a ref so changing it doesn't reconnect chat.
  const blacklistRef = useRef<Set<string>>(new Set());
  blacklistRef.current = parseBlacklist(blacklist);

  // Stable addMessage so the effect doesn't re-run on every render.
  const addMessage = useCallback((msg: ChatMsg) => {
    if (blacklistRef.current.has(msg.username.trim().toLowerCase())) return;
    setMessages((prev) => {
      const next = [...prev, msg];
      return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next;
    });
  }, []);

  // Keep the latest addMessage in a ref so the effect closure is always current.
  const addMessageRef = useRef(addMessage);
  addMessageRef.current = addMessage;

  // Derive a stable string key from the channels so the effect re-runs
  // only when an actual channel value changes (not when the object identity
  // changes on re-render with the same values).
  const channelsKey = `${PLATFORMS.map((p) => channels[p.id] ?? "").join("|")}|${connectionKey}`;

  useEffect(() => {
    if (!enabled) return;

    const connectors = PLATFORMS.map((p) => {
      const channel = channels[p.id];
      if (!channel?.trim()) return null;
      const conn = p.create();
      conn.onMessage((msg) => addMessageRef.current(msg));
      conn.onStatus((status, error) => {
        setStatuses((prev) => ({ ...prev, [p.id]: { status, error } }));
      });
      conn.connect(channel.trim());
      return conn;
    }).filter((c): c is NonNullable<typeof c> => c !== null);

    // Reset statuses for platforms we're not connecting to.
    setStatuses((prev) => {
      const next: Partial<Record<PlatformId, PlatformStatus>> = {};
      for (const p of PLATFORMS) {
        if (channels[p.id]?.trim()) next[p.id] = prev[p.id] ?? { status: "connecting" };
      }
      return next;
    });

    return () => {
      connectors.forEach((c) => c.disconnect());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, channelsKey]);

  const clear = useCallback(() => setMessages([]), []);

  return { messages, statuses, clear };
}
