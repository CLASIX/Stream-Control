/**
 * Twitch chat connector.
 *
 * Connects anonymously to Twitch's IRC-over-WebSocket endpoint using a
 * `justinfan` nickname — no OAuth or bot account required to *read* chat.
 * (Sending messages would require a token; see the README for how to add that.)
 *
 * IRC reference: https://dev.twitch.tv/docs/irc
 */
import { Emitter } from "../lib/Emitter";
import type { ChatMsg, ConnStatus, MessagePart, PlatformConnector } from "../types";
import { fetchThirdPartyEmotes, parseThirdPartyEmotes, type EmoteSet } from "../lib/emotes";

const WS_URL = "wss://irc-ws.chat.twitch.tv:443";

/** Parse the IRC `@tags` portion (`@key=value;key=value`) into a map. */
function parseTags(raw: string): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    tags[part.slice(0, eq)] = part
      .slice(eq + 1)
      .replace(/\\s/g, " ")
      .replace(/\\:/g, ";")
      .replace(/\\\\/g, "\\");
  }
  return tags;
}

/**
 * Split message text into text/emote parts using the Twitch `emotes` tag.
 * Tag format: `25:0-4,12-16/1902:6-10` (emoteId:start-end,start-end/…)
 */
function buildParts(text: string, emotesTag: string | undefined): MessagePart[] {
  if (!emotesTag) return [{ type: "text", text }];

  const ranges: { start: number; end: number; id: string }[] = [];
  for (const group of emotesTag.split("/")) {
    const [id, positions] = group.split(":");
    if (!id || !positions) continue;
    for (const pos of positions.split(",")) {
      const [s, e] = pos.split("-").map(Number);
      if (!Number.isNaN(s) && !Number.isNaN(e)) ranges.push({ start: s, end: e, id });
    }
  }
  if (ranges.length === 0) return [{ type: "text", text }];
  ranges.sort((a, b) => a.start - b.start);

  // Twitch indexes by unicode codepoints
  const chars = Array.from(text);
  const parts: MessagePart[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) parts.push({ type: "text", text: chars.slice(cursor, r.start).join("") });
    const name = chars.slice(r.start, r.end + 1).join("");
    parts.push({
      type: "emote",
      name,
      url: `https://static-cdn.jtvnw.net/emoticons/v2/${r.id}/default/dark/1.0`,
    });
    cursor = r.end + 1;
  }
  if (cursor < chars.length) parts.push({ type: "text", text: chars.slice(cursor).join("") });
  return parts;
}

export class TwitchConnector extends Emitter implements PlatformConnector {
  readonly id = "twitch" as const;
  readonly name = "Twitch";
  readonly color = "#9146FF";

  private ws: WebSocket | null = null;
  private closed = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 1000;
  private channel = "";
  private emoteSet: EmoteSet = {};

  connect(channel: string): void {
    this.closed = false;
    this.channel = channel.trim().toLowerCase().replace(/^#/, "");
    this.retryDelay = 1000;
    
    // Fetch 3rd party emotes as soon as we start connecting
    void fetchThirdPartyEmotes(this.channel).then(set => {
      this.emoteSet = set;
    });

    this.doConnect();
  }

  disconnect(): void {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
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

  private doConnect(): void {
    if (this.closed) return;
    this.setStatus("connecting");
    const ws = new WebSocket(WS_URL);
    this.ws = ws;

    ws.onopen = () => {
      const nick = `justinfan${Math.floor(10000 + Math.random() * 80000)}`;
      ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      ws.send(`NICK ${nick}`);
      ws.send(`JOIN #${this.channel}`);
    };

    ws.onmessage = (ev) => this.handleData(String(ev.data), ws);

    ws.onclose = () => {
      if (this.closed) return;
      this.setStatus("connecting");
      this.retryTimer = setTimeout(() => this.doConnect(), this.retryDelay);
      this.retryDelay = Math.min(this.retryDelay * 2, 15000);
    };

    ws.onerror = () => ws.close();
  }

  private handleData(data: string, ws: WebSocket): void {
    for (const line of data.split("\r\n")) {
      if (!line) continue;

      // Keepalive
      if (line.startsWith("PING")) {
        ws.send("PONG :tmi.twitch.tv");
        continue;
      }

      // JOIN confirmed
      if (line.includes(" 366 ")) {
        this.setStatus("connected");
        this.retryDelay = 1000;
        continue;
      }

      // Parse: [@tags] :prefix COMMAND params :trailing
      let rest = line;
      let tags: Record<string, string> = {};
      if (rest.startsWith("@")) {
        const sp = rest.indexOf(" ");
        tags = parseTags(rest.slice(1, sp));
        rest = rest.slice(sp + 1);
      }
      let prefix = "";
      if (rest.startsWith(":")) {
        const sp = rest.indexOf(" ");
        prefix = rest.slice(1, sp);
        rest = rest.slice(sp + 1);
      }
      if (!rest.startsWith("PRIVMSG")) continue;

      const trailingIdx = rest.indexOf(" :");
      if (trailingIdx === -1) continue;
      let text = rest.slice(trailingIdx + 2);

      // Strip /me ACTION wrappers
      if (text.startsWith("\u0001ACTION ")) {
        text = text.slice(8).replace(/\u0001$/, "");
      }

      const login = prefix.split("!")[0];
      const username = tags["display-name"] || login;
      const badges = (tags["badges"] || "")
        .split(",")
        .map((b) => b.split("/")[0])
        .filter(Boolean);

      const parts = buildParts(text, tags["emotes"]);
      const partsWithThirdParty = parseThirdPartyEmotes(parts, this.emoteSet);

      this.emit<ChatMsg>("message", {
        id: tags["id"] || `tw-${Date.now()}-${Math.random()}`,
        platform: "twitch",
        username,
        color: tags["color"] || undefined,
        badges,
        parts: partsWithThirdParty,
        timestamp: Date.now(),
        isFirstMessage: tags["first-msg"] === "1",
      });
    }
  }
}
