/**
 * OBS overlay chat feed — scrolling with optional TTL-based fade-out.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMsg } from "../types";
import type { ChatAnchor, ChatSlideFrom } from "../lib/chatStyle";
import { MessageRow } from "./MessageRow";
import {
  filterMessagesByPlatform,
  markFirstTimeChatters,
  messageMentionsNames,
  parseNameList,
  type ChatPlatformFilter,
} from "../lib/chatHighlight";

const MAX_VISIBLE = 25;
const ENTER_MS = 300;
const EXIT_MS = 500;

interface DisplayMsg {
  msg: ChatMsg;
  phase: "entering" | "visible" | "exiting";
}

interface Props {
  messages: ChatMsg[];
  fontSize: number;
  showTimestamps: boolean;
  showPlatform: boolean;
  anchor?: ChatAnchor;
  slideFrom?: ChatSlideFrom;
  ttlSeconds?: number;
  fontFamily?: string;
  className?: string;
  highlightFirst?: boolean;
  highlightNames?: string;
  highlightMentions?: boolean;
  highlightSelf?: boolean;
  useRoleColors?: boolean;
  platformFilter?: ChatPlatformFilter;
}

export function ChatOverlayFeed({
  messages,
  fontSize,
  showTimestamps,
  showPlatform,
  anchor = "top",
  slideFrom = "left",
  ttlSeconds = 0,
  fontFamily,
  className,
  highlightFirst = true,
  highlightNames = "",
  highlightMentions = true,
  highlightSelf = true,
  useRoleColors = true,
  platformFilter = "all",
}: Props) {
  const [display, setDisplay] = useState<DisplayMsg[]>([]);
  const lastSeenId = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>[]>>(new Map());

  const names = useMemo(() => parseNameList(highlightNames), [highlightNames]);
  const selfNames = useMemo(
    () => new Set(names.map((n) => n.toLowerCase())),
    [names]
  );

  const filtered = useMemo(
    () => filterMessagesByPlatform(messages, platformFilter),
    [messages, platformFilter]
  );

  // Keep a rolling window of platform-confirmed first messages.
  const firstIds = useMemo(() => {
    if (!highlightFirst) return new Set<string>();
    // Register full filtered history so confirmed first messages remain visible.
    return new Set(markFirstTimeChatters(filtered));
  }, [filtered, highlightFirst]);

  const ttlMs = ttlSeconds > 0 ? Math.max(1000, ttlSeconds * 1000) : 0;

  useEffect(() => {
    if (filtered.length === 0) {
      lastSeenId.current = null;
      setDisplay([]);
      return;
    }

    let startIndex = 0;
    if (lastSeenId.current) {
      const idx = filtered.findIndex((m) => m.id === lastSeenId.current);
      if (idx !== -1) {
        startIndex = idx + 1;
      } else {
        startIndex = Math.max(0, filtered.length - MAX_VISIBLE);
      }
    }

    if (startIndex >= filtered.length) return;

    const newMsgs = filtered.slice(startIndex);
    lastSeenId.current = newMsgs[newMsgs.length - 1].id;

    setDisplay((prev) => {
      const combined: DisplayMsg[] = [
        ...prev,
        ...newMsgs.map((msg) => ({ msg, phase: "entering" as const })),
      ];
      return combined.slice(-MAX_VISIBLE);
    });

    for (const msg of newMsgs) {
      const list: ReturnType<typeof setTimeout>[] = [];

      list.push(
        setTimeout(() => {
          setDisplay((prev) =>
            prev.map((d) => (d.msg.id === msg.id ? { ...d, phase: "visible" } : d))
          );
        }, ENTER_MS)
      );

      if (ttlMs > 0) {
        list.push(
          setTimeout(() => {
            setDisplay((prev) =>
              prev.map((d) => (d.msg.id === msg.id ? { ...d, phase: "exiting" } : d))
            );
          }, ttlMs)
        );
        list.push(
          setTimeout(() => {
            setDisplay((prev) => prev.filter((d) => d.msg.id !== msg.id));
            timers.current.delete(msg.id);
          }, ttlMs + EXIT_MS)
        );
      }

      timers.current.set(msg.id, list);
    }
  }, [filtered, ttlMs]);

  useEffect(() => {
    return () => {
      timers.current.forEach((list) => list.forEach(clearTimeout));
      timers.current.clear();
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [display]);

  const enterAnim =
    slideFrom === "right"
      ? `chatSlideInRight ${ENTER_MS}ms ease-out forwards`
      : `chatSlideInLeft ${ENTER_MS}ms ease-out forwards`;
  const exitAnim =
    slideFrom === "right"
      ? `chatSlideOutRight ${EXIT_MS}ms ease-in forwards`
      : `chatSlideOutLeft ${EXIT_MS}ms ease-in forwards`;

  return (
    <div
      ref={containerRef}
      className={`overflow-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className ?? ""}`}
      style={{
        fontFamily: fontFamily || undefined,
        display: "flex",
        flexDirection: "column",
        justifyContent: anchor === "bottom" ? "flex-end" : "flex-start",
      }}
    >
      <div>
        {display.map(({ msg, phase }) => {
          const first = highlightFirst && firstIds.has(msg.id);
          const mention =
            highlightMentions &&
            names.length > 0 &&
            messageMentionsNames(msg, names);
          const self =
            highlightSelf && selfNames.has(msg.username.trim().toLowerCase());
          return (
            <div
              key={msg.id}
              style={{
                animation:
                  phase === "entering"
                    ? enterAnim
                    : phase === "exiting"
                      ? exitAnim
                      : "none",
                opacity: phase === "visible" ? 1 : undefined,
              }}
              className={phase === "entering" ? "chat-overlay-msg" : ""}
            >
              <MessageRow
                msg={msg}
                fontSize={fontSize}
                showTimestamps={showTimestamps}
                showPlatform={showPlatform}
                isFirst={first}
                isMention={mention}
                isSelf={self}
                showFirstHighlight={highlightFirst}
                showMentionHighlight={highlightMentions}
                showSelfHighlight={highlightSelf}
                useRoleColors={useRoleColors}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
