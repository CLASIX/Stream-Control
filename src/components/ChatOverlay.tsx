/**
 * OBS browser-source for Chat ONLY.
 *
 * Activated by `?overlay=chat` (or legacy `?twitch=` / `?kick=`).
 */
import { useEffect } from "react";
import { useChat } from "../hooks/useChat";
import { ChatOverlayFeed } from "./ChatOverlayFeed";
import {
  ensureChatFontLoaded,
  getChatFont,
  type ChatAnchor,
  type ChatSlideFrom,
} from "../lib/chatStyle";
import type { ChatPlatformFilter } from "../lib/chatHighlight";

interface Props {
  params: URLSearchParams;
}

function flag(params: URLSearchParams, key: string, defaultOn = true): boolean {
  const v = params.get(key);
  if (v === null) return defaultOn;
  return v === "1" || v === "true";
}

export function ChatOverlay({ params }: Props) {
  const twitch = params.get("twitch") ?? "";
  const kick = params.get("kick") ?? "";
  const fontSize = Number(params.get("size") ?? 16);
  const showTimestamps = params.get("ts") === "1";
  const showPlatform = params.get("icons") !== "0";
  const transparent = params.get("bg") === "transparent";
  const anchor = (params.get("anchor") === "bottom" ? "bottom" : "top") as ChatAnchor;
  const slideFrom = (params.get("from") === "right" ? "right" : "left") as ChatSlideFrom;
  const fontId = params.get("font") ?? "default";
  const font = getChatFont(fontId);
  const ttlSeconds = Math.max(0, Number(params.get("ttl") ?? 0));

  const platformFilter = (params.get("pf") || "all") as ChatPlatformFilter;
  const highlightNames =
    params.get("hl") ||
    [twitch, kick].filter(Boolean).join(",");
  const highlightFirst = flag(params, "first", true);
  const highlightMentions = flag(params, "mention", true);
  const highlightSelf = flag(params, "self", true);
  const useRoleColors = flag(params, "roles", true);

  useEffect(() => {
    ensureChatFontLoaded(fontId);
  }, [fontId]);

  const { messages } = useChat({
    enabled: true,
    channels: { twitch, kick },
    blacklist: params.get("block") ?? "",
  });

  return (
    <div
      className={`h-screen w-screen flex flex-col ${
        transparent ? "bg-transparent" : "bg-[#0e0e12]"
      }`}
    >
      <ChatOverlayFeed
        messages={messages}
        fontSize={fontSize}
        showTimestamps={showTimestamps}
        showPlatform={showPlatform}
        anchor={anchor}
        slideFrom={slideFrom}
        ttlSeconds={ttlSeconds}
        fontFamily={font.family}
        highlightFirst={highlightFirst}
        highlightNames={highlightNames}
        highlightMentions={highlightMentions}
        highlightSelf={highlightSelf}
        useRoleColors={useRoleColors}
        platformFilter={
          platformFilter === "twitch" || platformFilter === "kick"
            ? platformFilter
            : "all"
        }
        className="flex-1 [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]"
      />
    </div>
  );
}
