import { useMemo, useState, type CSSProperties } from "react";
import { useChat } from "../hooks/useChat";
import { ChatFeed } from "./ChatFeed";
import { getChatFont, ensureChatFontLoaded } from "../lib/chatStyle";
import type { ChatPlatformFilter } from "../lib/chatHighlight";
import { useEffect } from "react";

interface Props {
  params: URLSearchParams;
}

function flag(params: URLSearchParams, key: string, defaultOn = true): boolean {
  const v = params.get(key);
  if (v === null) return defaultOn;
  return v === "1" || v === "true";
}

/**
 * Minimal chat reader for a small frameless desktop window.
 * Shares the same highlight / badge / filter features as the OBS overlay.
 */
export function PopoutChat({ params }: Props) {
  const twitch = params.get("twitch") ?? "";
  const kick = params.get("kick") ?? "";
  const fontSize = Number(params.get("size") ?? 14);
  const fontId = params.get("font") ?? "default";
  const font = getChatFont(fontId);
  const showTimestamps = params.get("ts") !== "0";
  const showPlatform = params.get("icons") !== "0";

  const initialFilter = (params.get("pf") || "all") as ChatPlatformFilter;
  const [platformFilter, setPlatformFilter] =
    useState<ChatPlatformFilter>(
      initialFilter === "twitch" || initialFilter === "kick"
        ? initialFilter
        : "all"
    );

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

  const channels = useMemo(() => ({ twitch, kick }), [twitch, kick]);

  const { messages } = useChat({
    enabled: true,
    channels,
    blacklist: params.get("block") ?? "",
  });

  const dragStyle = { WebkitAppRegion: "drag" } as CSSProperties;
  const noDragStyle = { WebkitAppRegion: "no-drag" } as CSSProperties;

  const filterBtn = (id: ChatPlatformFilter, label: string, color: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setPlatformFilter(id)}
      className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide transition-colors ${
        platformFilter === id
          ? "text-black"
          : "text-white/50 hover:text-white/80 bg-white/5"
      }`}
      style={
        platformFilter === id
          ? { background: color, ...noDragStyle }
          : noDragStyle
      }
      title={`Show ${label}`}
    >
      {label}
    </button>
  );

  return (
    <div
      className="h-screen w-screen bg-[#0e0e12] flex flex-col overflow-hidden select-none"
      style={{ fontFamily: font.family }}
    >
      {/* Slim drag strip + platform filter */}
      <div
        className="group flex h-6 shrink-0 items-center justify-between gap-2 bg-white/[0.04] px-2 border-b border-white/5"
        style={dragStyle}
        title="Drag to move"
      >
        <div className="flex items-center gap-1.5" style={noDragStyle}>
          {twitch && (
            <span
              className="h-1.5 w-1.5 rounded-full bg-[#9146FF]"
              title={`Twitch: ${twitch}`}
            />
          )}
          {kick && (
            <span
              className="h-1.5 w-1.5 rounded-full bg-[#53FC18]"
              title={`Kick: ${kick}`}
            />
          )}
          <div className="ml-1 flex items-center gap-1">
            {filterBtn("all", "All", "#ffffff")}
            {twitch && filterBtn("twitch", "Twitch", "#9146FF")}
            {kick && filterBtn("kick", "Kick", "#53FC18")}
          </div>
        </div>
        <button
          onClick={() => window.close()}
          className="text-white/25 hover:text-red-400 text-[11px] leading-none font-bold transition-colors"
          style={noDragStyle}
          title="Close"
        >
          ✕
        </button>
      </div>

      <ChatFeed
        messages={messages}
        fontSize={fontSize}
        showTimestamps={showTimestamps}
        showPlatform={showPlatform}
        highlightFirst={highlightFirst}
        highlightNames={highlightNames}
        highlightMentions={highlightMentions}
        highlightSelf={highlightSelf}
        useRoleColors={useRoleColors}
        platformFilter={platformFilter}
        compact
        className="flex-1"
      />
    </div>
  );
}
