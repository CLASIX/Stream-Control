import { useEffect, useMemo, useRef } from "react";
import type { ChatMsg } from "../types";
import { MessageRow } from "./MessageRow";
import {
  filterMessagesByPlatform,
  markFirstTimeChatters,
  messageMentionsNames,
  parseNameList,
  type ChatPlatformFilter,
} from "../lib/chatHighlight";

interface Props {
  messages: ChatMsg[];
  fontSize: number;
  showTimestamps: boolean;
  showPlatform: boolean;
  className?: string;
  /** Highlight platform-confirmed first-time chatters. */
  highlightFirst?: boolean;
  /** Names that count as "mention me" (broadcaster + extras). */
  highlightNames?: string;
  /** Whether to highlight @mentions of those names. */
  highlightMentions?: boolean;
  /** Whether to highlight messages from the streamer themselves. */
  highlightSelf?: boolean;
  /** Use role-based name colors. */
  useRoleColors?: boolean;
  /** Filter by platform. */
  platformFilter?: ChatPlatformFilter;
  compact?: boolean;
}

/**
 * Auto-scrolling chat feed.
 *
 * Sticks to the bottom as new messages arrive, but lets the user scroll
 * up to read history — and resumes auto-scroll once they're back near
 * the bottom.
 */
export function ChatFeed({
  messages,
  fontSize,
  showTimestamps,
  showPlatform,
  className,
  highlightFirst = true,
  highlightNames = "",
  highlightMentions = true,
  highlightSelf = true,
  useRoleColors = true,
  platformFilter = "all",
  compact = false,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const names = useMemo(() => parseNameList(highlightNames), [highlightNames]);
  const selfNames = useMemo(
    () => new Set(names.map((n) => n.toLowerCase())),
    [names]
  );

  const visible = useMemo(
    () => filterMessagesByPlatform(messages, platformFilter),
    [messages, platformFilter]
  );

  // Register platform-confirmed first messages across re-renders.
  const firstIds = useMemo(() => {
    if (!highlightFirst) return new Set<string>();
    // Returns sticky set of platform-confirmed first messages.
    return new Set(markFirstTimeChatters(visible));
  }, [visible, highlightFirst]);

  const scrollToBottom = () => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  useEffect(() => {
    if (stickToBottom.current) scrollToBottom();
  }, [visible]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const ro = new ResizeObserver(() => {
      if (stickToBottom.current) scrollToBottom();
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  const updateStickiness = () => {
    const el = ref.current;
    if (!el) return;
    stickToBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  return (
    <div
      ref={ref}
      onWheel={(e) => {
        if (e.deltaY < 0) {
          stickToBottom.current = false;
        } else {
          updateStickiness();
        }
      }}
      onTouchMove={updateStickiness}
      onScroll={() => {
        const el = ref.current;
        if (!el) return;
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 8) {
          stickToBottom.current = true;
        }
      }}
      className={`overflow-y-auto overflow-x-hidden [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent] ${className ?? ""}`}
    >
      <div ref={contentRef}>
        {visible.length === 0 ? (
          <div className="h-full flex items-center justify-center text-white/30 text-sm p-6 text-center">
            Waiting for chat messages…
          </div>
        ) : (
          visible.map((m) => {
            const first = highlightFirst && firstIds.has(m.id);
            const mention =
              highlightMentions &&
              names.length > 0 &&
              messageMentionsNames(m, names);
            const self =
              highlightSelf && selfNames.has(m.username.trim().toLowerCase());
            return (
              <MessageRow
                key={m.id}
                msg={m}
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
                compact={compact}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
