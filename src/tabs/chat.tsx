/**
 * Chat module.
 *
 * Owns:
 *   - Channel inputs for every registered platform.
 *   - Appearance settings (font size, font, timestamps, platform icons).
 *   - Orientation settings (anchor, slide direction).
 *   - Username blacklist.
 *   - The OBS overlay URL generator + copy button.
 *   - The popout chat reader launcher.
 *
 * Each section below is a "module card" with a stable id. Their order is
 * persisted in `settings.chatModuleOrder` and drag-reorderable whenever
 * global Edit Mode is on (toggled from the sidebar).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "../lib/store";
import { BrowserSourceCard } from "../components/BrowserSourceCard";
import { TileCard } from "../components/TileCard";
import { FreeformBoard, type FreeformBoardItem } from "../components/FreeformBoard";
import { buildChatOverlayUrl, buildPopoutChatUrl } from "../lib/overlayUrls";
import { applyOrder } from "../lib/reorder";
import { CHAT_FONTS, ensureChatFontLoaded } from "../lib/chatStyle";
import type { Tab } from "../types";

function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChatModule() {
  const { settings, update } = useStore();
  const editMode = settings.editMode;

  const highlightNamesCombined = useMemo(() => {
    const extra = settings.chatHighlightNames.trim();
    const channels = [settings.twitchChannel, settings.kickChannel]
      .map((c) => c.trim())
      .filter(Boolean)
      .join(",");
    return [channels, extra].filter(Boolean).join(",");
  }, [
    settings.chatHighlightNames,
    settings.twitchChannel,
    settings.kickChannel,
  ]);

  const chatOpts = useMemo(
    () => ({
      twitch: settings.twitchChannel,
      kick: settings.kickChannel,
      size: settings.fontSize,
      showTimestamps: settings.showTimestamps,
      showPlatform: settings.showPlatform,
      anchor: settings.chatAnchor,
      from: settings.chatSlideFrom,
      font: settings.chatFont,
      block: settings.chatBlacklist,
      ttl: settings.chatTtl,
      platformFilter: settings.chatPlatformFilter,
      highlightNames: highlightNamesCombined,
      highlightFirst: settings.chatHighlightFirst,
      highlightMentions: settings.chatHighlightMentions,
      highlightSelf: settings.chatHighlightSelf,
      useRoleColors: settings.chatRoleColors,
    }),
    [
      settings.twitchChannel,
      settings.kickChannel,
      settings.fontSize,
      settings.showTimestamps,
      settings.showPlatform,
      settings.chatAnchor,
      settings.chatSlideFrom,
      settings.chatFont,
      settings.chatBlacklist,
      settings.chatTtl,
      settings.chatPlatformFilter,
      highlightNamesCombined,
      settings.chatHighlightFirst,
      settings.chatHighlightMentions,
      settings.chatHighlightSelf,
      settings.chatRoleColors,
    ]
  );

  const popoutUrl = useMemo(
    () =>
      buildPopoutChatUrl({
        ...chatOpts,
        size: 13,
        showTimestamps: true,
        showPlatform: true,
      }),
    [chatOpts]
  );

  const [popoutOpen, setPopoutOpen] = useState(false);

  useEffect(() => {
    const sc = window.streamControl;
    if (!sc) return;
    sc.isPopoutOpen?.().then(setPopoutOpen);
    return sc.onPopoutStatus?.(setPopoutOpen);
  }, []);

  const togglePopout = () => {
    if (popoutOpen) {
      if (window.streamControl?.closePopout) void window.streamControl.closePopout();
      setPopoutOpen(false);
    } else {
      if (window.streamControl?.openPopout) {
        void window.streamControl.openPopout(popoutUrl);
      } else {
        window.open(popoutUrl, "ChatPopout", "width=350,height=600,resizable=yes");
      }
      setPopoutOpen(true);
    }
  };

  const hasAnyChannel = Boolean(settings.twitchChannel.trim() || settings.kickChannel.trim());

  const overlayUrl = useMemo(() => buildChatOverlayUrl(chatOpts), [chatOpts]);

  useEffect(() => {
    ensureChatFontLoaded(settings.chatFont);
  }, [settings.chatFont]);

  // ---- Module cards (order persisted + drag-reorderable) ----
  const cards: { id: string; node: ReactNode }[] = [

    {
      id: "blockedUsers",
      node: (
        <TileCard title="Blocked Users" editMode={editMode}>
          <p className="text-[11px] text-white/40">
            Hidden in the OBS chat overlay and desktop chat window. Case-insensitive.
          </p>
          <textarea
            value={settings.chatBlacklist}
            onChange={(e) => update({ chatBlacklist: e.target.value })}
            placeholder={"Nightbot, StreamElements\none name per line or comma-separated"}
            rows={4}
            className="w-full resize-y rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none transition-colors focus:border-[#9146FF]"
          />
        </TileCard>
      ),
    },


    {
      id: "highlights",
      node: (
        <TileCard title="Chat Highlights" editMode={editMode}>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={settings.chatHighlightFirst}
              onChange={(e) => update({ chatHighlightFirst: e.target.checked })}
              className="accent-[#f5a623] w-4 h-4"
            />
            Highlight first-time chatters
          </label>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={settings.chatHighlightMentions}
              onChange={(e) => update({ chatHighlightMentions: e.target.checked })}
              className="accent-[#9146FF] w-4 h-4"
            />
            Highlight @mentions of you
          </label>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={settings.chatHighlightSelf}
              onChange={(e) => update({ chatHighlightSelf: e.target.checked })}
              className="accent-[#1DB954] w-4 h-4"
            />
            Highlight your own messages
          </label>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={settings.chatRoleColors}
              onChange={(e) => update({ chatRoleColors: e.target.checked })}
              className="accent-[#00ad03] w-4 h-4"
            />
            Role-colored names (mod / VIP / sub)
          </label>

          <div>
            <label className="text-sm mb-1.5 block">Extra highlight names</label>
            <input
              value={settings.chatHighlightNames}
              onChange={(e) => update({ chatHighlightNames: e.target.value })}
              placeholder="aliases, bots that count as you"
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#9146FF] transition-colors"
            />
            <p className="text-[11px] text-white/40 mt-1 leading-relaxed">
              Channel names are always included. Used for @mentions and “you” highlights.
            </p>
          </div>

          <div>
            <label className="text-sm mb-1.5 block">Platform filter (overlay default)</label>
            <div className="grid grid-cols-3 gap-1 bg-black/40 border border-white/10 rounded-lg p-1">
              {(["all", "twitch", "kick"] as const).map((pf) => (
                <button
                  key={pf}
                  onClick={() => update({ chatPlatformFilter: pf })}
                  className={`py-1.5 rounded-md text-xs font-semibold capitalize transition-colors ${
                    settings.chatPlatformFilter === pf
                      ? "bg-[#9146FF] text-white"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {pf}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-white/40 mt-1 leading-relaxed">
              Popout can still switch live. Re-copy the OBS URL after changing.
            </p>
          </div>
        </TileCard>
      ),
    },
    {
      id: "orientation",
      node: (
        <TileCard title="Orientation" editMode={editMode}>
          <div>
            <label className="text-sm mb-1.5 block">Messages appear from</label>
            <div className="grid grid-cols-2 gap-1 bg-black/40 border border-white/10 rounded-lg p-1">
              {(["left", "right"] as const).map((side) => (
                <button
                  key={side}
                  onClick={() => update({ chatSlideFrom: side })}
                  className={`py-1.5 rounded-md text-xs font-semibold capitalize transition-colors ${
                    settings.chatSlideFrom === side
                      ? "bg-[#9146FF] text-white"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {side === "left" ? "← Left" : "Right →"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm mb-1.5 block">Feed anchored to</label>
            <div className="grid grid-cols-2 gap-1 bg-black/40 border border-white/10 rounded-lg p-1">
              {(["top", "bottom"] as const).map((pos) => (
                <button
                  key={pos}
                  onClick={() => update({ chatAnchor: pos })}
                  className={`py-1.5 rounded-md text-xs font-semibold capitalize transition-colors ${
                    settings.chatAnchor === pos
                      ? "bg-[#9146FF] text-white"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {pos === "top" ? "↑ Top" : "↓ Bottom"}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-white/40 mt-1 leading-relaxed">
              Top: new messages push down. Bottom: feed hugs the lower edge.
            </p>
          </div>
        </TileCard>
      ),
    },
    {
      id: "appearance",
      node: (
        <TileCard title="Appearance" editMode={editMode}>
          <div className="flex items-center justify-between gap-4">
            <label className="text-sm">Font size (px)</label>
            <input
              type="number"
              min={10}
              max={48}
              value={settings.fontSize}
              onChange={(e) => update({ fontSize: Number(e.target.value) })}
              className="w-24 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-center outline-none focus:border-[#9146FF] transition-colors"
            />
          </div>

          <div>
            <label className="text-sm mb-1.5 block">Font</label>
            <select
              value={settings.chatFont}
              onChange={(e) => update({ chatFont: e.target.value })}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#9146FF] transition-colors [&>option]:bg-[#16161d]"
            >
              {CHAT_FONTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-white/40 mt-1 leading-relaxed">
              Fonts load automatically in OBS — no install needed.
            </p>
          </div>

          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={settings.showPlatform}
              onChange={(e) => update({ showPlatform: e.target.checked })}
              className="accent-[#53FC18] w-4 h-4"
            />
            Show platform icons
          </label>

          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={settings.showTimestamps}
              onChange={(e) => update({ showTimestamps: e.target.checked })}
              className="accent-[#53FC18] w-4 h-4"
            />
            Show timestamps
          </label>

          <div>
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm">Message duration (seconds)</label>
              <input
                type="number"
                min={0}
                max={3600}
                value={settings.chatTtl}
                onChange={(e) => update({ chatTtl: Number(e.target.value) })}
                className="w-24 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-center outline-none focus:border-[#9146FF] transition-colors"
              />
            </div>
            <p className="text-[11px] text-white/40 mt-1.5 leading-relaxed">
              Seconds before each message slides back out. Set to 0 to keep messages until they scroll off.
            </p>
          </div>
        </TileCard>
      ),
    },
    {
      id: "obsSource",
      node: (
        <div className="h-full">
          <BrowserSourceCard
            title="OBS Browser Source — Chat"
            description="In OBS: Sources → + → Browser → paste this URL. Suggested size: 400×600. Re-copy after changing settings."
            url={overlayUrl}
            accentColor="#9146FF"
            copyLabel="Copy Chat Overlay URL"
            note="Now Playing is set up separately in the Now Playing module."
          />
        </div>
      ),
    },
    {
      id: "popout",
      node: (
        <TileCard title="Desktop Chat Window" editMode={editMode}>
          <p className="text-xs text-white/50 leading-relaxed">
            Open a small frameless always-on-top window to read your merged chat while streaming or gaming.
          </p>
          <button
            onClick={togglePopout}
            disabled={!hasAnyChannel}
            className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-colors disabled:opacity-40 ${
              popoutOpen
                ? "bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30"
                : "bg-white/10 hover:bg-white/20 text-white"
            }`}
          >
            {popoutOpen ? "Close Desktop Chat Window" : "Open Desktop Chat Window"}
          </button>
        </TileCard>
      ),
    },
  ];

  const boardItems: FreeformBoardItem[] = useMemo(
    () =>
      applyOrder(cards, settings.chatModuleOrder || [], (c) => c.id).map((c, i) => ({
        id: c.id,
        title:
          c.id === "channels"
            ? "Channels"
            : c.id === "highlights"
              ? "Chat Highlights"
              : c.id === "orientation"
                ? "Orientation"
                : c.id === "appearance"
                  ? "Appearance"
                  : c.id === "obsSource"
                    ? "OBS Source"
                    : c.id === "popout"
                      ? "Desktop Chat Window"
                      : c.id,
        node: c.node,
        defaultW: 360,
        defaultX: (i % 2) * 380,
        defaultY: Math.floor(i / 2) * 280,
      })),
    // cards is recreated each render; depend on settings that affect card content/order
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, overlayUrl, hasAnyChannel, editMode, popoutOpen]
  );

  return (
    <div className="w-full min-w-0">
      <header className="mb-4 flex items-start justify-between gap-4 pr-[150px] sm:pr-[160px] pt-6">
        <div>
          <h2 className="text-2xl font-bold">Chat Overlay</h2>
          <p className="text-white/50 text-sm mt-1">
            Merge your Twitch &amp; Kick chats into one clean overlay for your stream.
          </p>
        </div>
        {editMode && (
          <span className="shrink-0 rounded-full bg-[#9146FF]/15 border border-[#9146FF]/30 px-3 py-1.5 text-[11px] font-semibold text-[#c9a8ff]">
            Edit mode — drag cards anywhere · resize from corner
          </span>
        )}
      </header>

      <FreeformBoard
        items={boardItems}
        layout={settings.chatBoardLayout || {}}
        onChange={(chatBoardLayout) => update({ chatBoardLayout })}
        editMode={editMode}
        minHeight={560}
      />
    </div>
  );
}

export const chatTab: Tab = {
  id: "chat",
  name: "Chat Overlay",
  icon: <ChatIcon />,
  description: "Merge Twitch & Kick chat into a stream overlay.",
  Component: ChatModule,
};

export const chatModule = chatTab;
