import type { MessagePart } from "../types";

export interface Emote {
  id: string;
  name: string;
  url: string;
}

export interface EmoteSet {
  [name: string]: Emote;
}

/**
 * Fetches 7TV, BTTV, and FFZ emotes for a Twitch channel.
 * Note: These are only for Twitch; Kick uses a different system.
 */
export async function fetchThirdPartyEmotes(channelName: string): Promise<EmoteSet> {
  const emotes: EmoteSet = {};
  const channel = channelName.toLowerCase();

  try {
    // 1. Get Twitch User ID (required for some 7TV/BTTV/FFZ lookups)
    // For now, we try slug-based lookups where possible.
    
    // 7TV (V3)
    const stvRes = await fetch(`https://7tv.io/v3/users/twitch/${channel}`).catch(() => null);
    if (stvRes?.ok) {
      const data = await stvRes.json();
      data.emote_set?.emotes?.forEach((e: any) => {
        const host = e.data.host.url;
        emotes[e.name] = {
          id: e.id,
          name: e.name,
          url: `https:${host}/2x.webp`,
        };
      });
    }

    // BTTV (BetterTTV)
    const bttvRes = await fetch(`https://api.betterttv.net/3/cached/users/twitch/${channel}`).catch(() => null);
    if (bttvRes?.ok) {
      const data = await bttvRes.json();
      [...(data.channelEmotes || []), ...(data.sharedEmotes || [])].forEach((e: any) => {
        emotes[e.code] = {
          id: e.id,
          name: e.code,
          url: `https://cdn.betterttv.net/emote/${e.id}/2x`,
        };
      });
    }

    // FFZ (FrankerFaceZ)
    const ffzRes = await fetch(`https://api.frankerfacez.com/v1/room/${channel}`).catch(() => null);
    if (ffzRes?.ok) {
      const data = await ffzRes.json();
      const set = data.sets[Object.keys(data.sets)[0]];
      set?.emoticons?.forEach((e: any) => {
        const url = e.urls["2"] || e.urls["1"];
        emotes[e.name] = {
          id: String(e.id),
          name: e.name,
          url: url.startsWith("http") ? url : `https:${url}`,
        };
      });
    }
  } catch (err) {
    console.error("Failed to fetch 3rd party emotes:", err);
  }

  return emotes;
}

/** 
 * Replaces text tokens with 3rd party emotes.
 * Twitch native emotes are handled via character indexes, but 3rd party
 * are just text tokens (like "KEKW").
 */
export function parseThirdPartyEmotes(parts: MessagePart[], emoteSet: EmoteSet): MessagePart[] {
  const result: MessagePart[] = [];

  for (const part of parts) {
    if (part.type !== "text") {
      result.push(part);
      continue;
    }

    const words = part.text.split(/(\s+)/);
    for (const word of words) {
      const emote = emoteSet[word.trim()];
      if (emote) {
        result.push({ type: "emote", name: emote.name, url: emote.url });
      } else if (word) {
        // Merge adjacent text parts
        const last = result[result.length - 1];
        if (last && last.type === "text") {
          last.text += word;
        } else {
          result.push({ type: "text", text: word });
        }
      }
    }
  }

  return result;
}
