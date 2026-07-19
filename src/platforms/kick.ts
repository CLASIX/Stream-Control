/**
 * Kick chat connector.
 *
 * Kick has no official chat API, but its website renders chat through a
 * public Pusher WebSocket. We connect to the same endpoint anonymously
 * and subscribe to `chatrooms.<id>.v2`.
 *
 * To subscribe we need the numeric chatroom id for a channel slug. We
 * fetch it from Kick's public REST endpoint; since that endpoint sits
 * behind Cloudflare and doesn't send CORS headers, we fall back to
 * public CORS proxies. If all lookups fail, the user can paste the
 * numeric chatroom id directly into the channel field.
 *
 * If Kick ever changes their Pusher app key, update `PUSHER_URL` below
 * (find it in Chrome DevTools → Network → WS on kick.com).
 */
import { Emitter } from "../lib/Emitter";
import type { ChatMsg, ConnStatus, MessagePart, PlatformConnector } from "../types";

const PUSHER_URL =
  "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0-rc2&flash=false";

/** Resolve a Kick channel slug (or numeric chatroom id) to a chatroom id. */
async function resolveChatroomId(slug: string): Promise<number> {
  if (/^\d+$/.test(slug)) return Number(slug);

  const apiUrl = `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`;
  const attempts = [
    apiUrl,
    `https://corsproxy.io/?url=${encodeURIComponent(apiUrl)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(apiUrl)}`,
  ];

  for (const url of attempts) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) continue;
      const data = await res.json();
      const id = data?.chatroom?.id;
      if (typeof id === "number") return id;
    } catch {
      /* try next proxy */
    }
  }
  throw new Error(`Could not resolve chatroom id for "${slug}"`);
}

/** Convert Kick message content (`[emote:ID:name]` tokens) into parts. */
function buildParts(content: string): MessagePart[] {
  const parts: MessagePart[] = [];
  const regex = /\[emote:(\d+):([^\]]*)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    if (m.index > last) parts.push({ type: "text", text: content.slice(last, m.index) });
    parts.push({
      type: "emote",
      name: m[2] || "emote",
      url: `https://files.kick.com/emotes/${m[1]}/fullsize`,
    });
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push({ type: "text", text: content.slice(last) });
  if (parts.length === 0) parts.push({ type: "text", text: content });
  return parts;
}

export class KickConnector extends Emitter implements PlatformConnector {
  readonly id = "kick" as const;
  readonly name = "Kick";
  readonly color = "#53FC18";

  private ws: WebSocket | null = null;
  private closed = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retryDelay = 1000;

  connect(channel: string): void {
    this.closed = false;
    this.retryDelay = 1000;
    void this.start(channel.trim().toLowerCase().replace(/^@/, ""));
  }

  disconnect(): void {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
    this.ws = null;
    this.removeAllListeners();
  }

  onMessage(cb: (msg: ChatMsg) => void): () => void {
    return this.on<ChatMsg>("message", cb);
  }

  onStatus(cb: (status: ConnStatus, error?: string) => void): () => void {
    return this.on<{ status: ConnStatus; error?: string }>("status", (p) =>
      cb(p.status, p.error)
    );
  }

  private setStatus(status: ConnStatus, error?: string) {
    this.emit("status", { status, error });
  }

  private async start(slug: string): Promise<void> {
    this.setStatus("connecting");
    let chatroomId: number;
    try {
      chatroomId = await resolveChatroomId(slug);
    } catch {
      if (!this.closed) {
        this.setStatus(
          "error",
          "Couldn't look up that Kick channel. Try entering the numeric chatroom ID instead."
        );
      }
      return;
    }
    if (this.closed) return;
    this.doConnect(chatroomId);
  }

  private doConnect(chatroomId: number): void {
    if (this.closed) return;
    this.setStatus("connecting");
    const ws = new WebSocket(PUSHER_URL);
    this.ws = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          event: "pusher:subscribe",
          data: { auth: "", channel: `chatrooms.${chatroomId}.v2` },
        })
      );
      this.pingTimer = setInterval(() => {
        ws.send(JSON.stringify({ event: "pusher:ping", data: {} }));
      }, 60_000);
    };

    ws.onmessage = (ev) => {
      let frame: { event?: string; data?: string };
      try {
        frame = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (frame.event === "pusher:ping") {
        ws.send(JSON.stringify({ event: "pusher:pong", data: {} }));
        return;
      }
      if (frame.event === "pusher_internal:subscription_succeeded") {
        this.setStatus("connected");
        this.retryDelay = 1000;
        return;
      }
      if (frame.event === "App\\Events\\ChatMessageEvent" && frame.data) {
        this.handleMessage(frame.data);
      }
    };

    ws.onclose = () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      if (this.closed) return;
      this.setStatus("connecting");
      this.retryTimer = setTimeout(() => this.doConnect(chatroomId), this.retryDelay);
      this.retryDelay = Math.min(this.retryDelay * 2, 15_000);
    };

    ws.onerror = () => ws.close();
  }

  private handleMessage(data: string): void {
    try {
      const parsed = JSON.parse(data);
      const sender = parsed.sender ?? {};
      const identity = sender.identity ?? {};
      const badges: string[] = Array.isArray(identity.badges)
        ? identity.badges.map((b: { type?: string }) => b?.type ?? "").filter(Boolean)
        : [];
      this.emit<ChatMsg>("message", {
        id: parsed.id || `kick-${Date.now()}-${Math.random()}`,
        platform: "kick",
        username: sender.username || "unknown",
        color: identity.color || undefined,
        badges,
        parts: buildParts(String(parsed.content ?? "")),
        timestamp: Date.now(),
      });
    } catch {
      /* malformed frame — ignore */
    }
  }
}
