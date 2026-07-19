/**
 * Shared chat highlight helpers used by overlay + popout + dashboard.
 */
import type { ChatMsg, PlatformId } from "../types";

export type ChatPlatformFilter = "all" | "twitch" | "kick";

/** Collect plain text from message parts. */
export function messagePlainText(msg: ChatMsg): string {
  return msg.parts
    .map((p) => (p.type === "text" ? p.text : p.name))
    .join("");
}

/**
 * Platform-confirmed first-time chatters.
 * Twitch marks a user's first message ever in a channel with its
 * `first-msg` tag. Do not infer this from the current app/session history:
 * that would falsely highlight returning viewers after a restart.
 */
const firstMessageIds = new Set<string>();

export function resetSessionFirstChatters(): void {
  firstMessageIds.clear();
}

/**
 * Register platform-confirmed first messages and return their ids. Safe to
 * call every render; previously marked messages keep their flag.
 */
export function markFirstTimeChatters(messages: ChatMsg[]): Set<string> {
  for (const msg of messages) {
    if (msg.isFirstMessage) firstMessageIds.add(msg.id);
  }
  return firstMessageIds;
}

export function isFirstTimeChatterMessage(msgId: string): boolean {
  return firstMessageIds.has(msgId);
}

/** @deprecated use markFirstTimeChatters */
export function isFirstMessageFromUser(
  msg: ChatMsg,
  allMessages?: ChatMsg[]
): boolean {
  if (allMessages) markFirstTimeChatters(allMessages);
  else markFirstTimeChatters([msg]);
  return firstMessageIds.has(msg.id);
}

/**
 * Detect @mentions of the broadcaster (or configured highlight names).
 * Matches @name and bare name when preceded by whitespace / start.
 */
export function messageMentionsNames(
  msg: ChatMsg,
  names: string[]
): boolean {
  const text = messagePlainText(msg).toLowerCase();
  if (!text) return false;
  for (const raw of names) {
    const name = raw.trim().toLowerCase().replace(/^@/, "");
    if (!name || name.length < 2) continue;
    // @name or standalone word
    const re = new RegExp(
      `(^|[^a-z0-9_])@?${escapeRegExp(name)}(?![a-z0-9_])`,
      "i"
    );
    if (re.test(text)) return true;
  }
  return false;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Parse comma/newline list of highlight usernames. */
export function parseNameList(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,]+/)
    .map((n) => n.trim().replace(/^@/, ""))
    .filter(Boolean);
}

export function filterMessagesByPlatform(
  messages: ChatMsg[],
  filter: ChatPlatformFilter
): ChatMsg[] {
  if (filter === "all") return messages;
  return messages.filter((m) => m.platform === (filter as PlatformId));
}

/** Role rank for badge / name styling priority. */
export function primaryRole(
  badges: string[]
): "broadcaster" | "moderator" | "vip" | "subscriber" | "staff" | null {
  const set = new Set(badges.map((b) => b.toLowerCase()));
  if (set.has("broadcaster")) return "broadcaster";
  if (set.has("moderator") || set.has("mod")) return "moderator";
  if (set.has("vip")) return "vip";
  if (set.has("staff") || set.has("admin") || set.has("global_mod"))
    return "staff";
  if (set.has("subscriber") || set.has("founder")) return "subscriber";
  return null;
}

export const ROLE_NAME_COLORS: Record<string, string> = {
  broadcaster: "#ff6b6b",
  moderator: "#00ad03",
  vip: "#e005b9",
  subscriber: "#a970ff",
  staff: "#00a0ff",
};
