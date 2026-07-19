import type { ChatMsg } from "../types";
import { PlatformIcon } from "./PlatformIcon";
import {
  messagePlainText,
  primaryRole,
  ROLE_NAME_COLORS,
} from "../lib/chatHighlight";

/** Badge display metadata. Extend as platforms introduce new badge types. */
const BADGE_ICONS: Record<string, { label: string; icon: string; color: string }> = {
  broadcaster: { label: "Broadcaster", icon: "🎥", color: "#ff6b6b" },
  moderator: { label: "Moderator", icon: "🛡️", color: "#00ad03" },
  vip: { label: "VIP", icon: "💎", color: "#e005b9" },
  subscriber: { label: "Subscriber", icon: "⭐", color: "#a970ff" },
  sub_gifter: { label: "Sub Gifter", icon: "🎁", color: "#f5a623" },
  founder: { label: "Founder", icon: "🏆", color: "#c9a227" },
  og: { label: "OG", icon: "🔥", color: "#ff7a18" },
  verified: { label: "Verified", icon: "✔️", color: "#1da1f2" },
  staff: { label: "Staff", icon: "🔧", color: "#00a0ff" },
  admin: { label: "Admin", icon: "🔧", color: "#00a0ff" },
  global_mod: { label: "Global Mod", icon: "🌐", color: "#0c6e3d" },
  artist: { label: "Artist", icon: "🎨", color: "#1f69ff" },
  partner: { label: "Partner", icon: "✓", color: "#9146ff" },
};

export interface MessageRowProps {
  msg: ChatMsg;
  fontSize: number;
  showTimestamps: boolean;
  showPlatform: boolean;
  /** Platform-confirmed first-time chatter. */
  isFirst?: boolean;
  /** Message @mentions the broadcaster / highlight names. */
  isMention?: boolean;
  /** Message is from the streamer (matches channel name). */
  isSelf?: boolean;
  /** Show first-time chatter pill. */
  showFirstHighlight?: boolean;
  /** Show mention highlight background. */
  showMentionHighlight?: boolean;
  /** Show self-message highlight. */
  showSelfHighlight?: boolean;
  /** Use role-based name colors when no user color is set. */
  useRoleColors?: boolean;
  /** Slightly denser layout for mod / popout reading. */
  compact?: boolean;
}

/** Renders a single chat message line with badges, coloured name, and emotes. */
export function MessageRow({
  msg,
  fontSize,
  showTimestamps,
  showPlatform,
  isFirst = false,
  isMention = false,
  isSelf = false,
  showFirstHighlight = true,
  showMentionHighlight = true,
  showSelfHighlight = true,
  useRoleColors = true,
  compact = false,
}: MessageRowProps) {
  const role = primaryRole(msg.badges);
  const fallbackColor =
    (useRoleColors && role && ROLE_NAME_COLORS[role]) ||
    (msg.platform === "twitch" ? "#a970ff" : "#53fc18");
  const nameColor = msg.color || fallbackColor;
  const time = new Date(msg.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const highlightFirst = showFirstHighlight && isFirst;
  const highlightMention = showMentionHighlight && isMention;
  const highlightSelf = showSelfHighlight && isSelf;

  let bg = "transparent";
  let ring = "none";
  if (highlightSelf) {
    bg = "rgba(29, 185, 84, 0.12)";
    ring = "inset 3px 0 0 #1DB954";
  } else if (highlightMention) {
    bg = "rgba(145, 70, 255, 0.14)";
    ring = "inset 3px 0 0 #9146FF";
  } else if (highlightFirst) {
    bg = "rgba(255, 184, 0, 0.10)";
    ring = "inset 3px 0 0 #f5a623";
  }

  // For accessibility / screen readers
  const plain = messagePlainText(msg);

  return (
    <div
      className={`leading-snug break-words animate-[slideIn_0.25s_ease-out] ${
        compact ? "px-2.5 py-1" : "px-3 py-1.5"
      }`}
      style={{
        fontSize,
        background: bg,
        boxShadow: ring,
      }}
      data-platform={msg.platform}
      data-first={highlightFirst ? "1" : "0"}
      data-mention={highlightMention ? "1" : "0"}
      data-self={highlightSelf ? "1" : "0"}
      title={plain}
    >
      {highlightFirst && (
        <span
          className="mr-1.5 inline-flex items-center rounded px-1 py-px font-bold uppercase tracking-wide text-black"
          style={{
            fontSize: fontSize * 0.62,
            background: "#f5a623",
            verticalAlign: "middle",
          }}
          title="First-time chatter"
        >
          new
        </span>
      )}
      {highlightMention && !highlightSelf && (
        <span
          className="mr-1.5 inline-flex items-center rounded px-1 py-px font-bold uppercase tracking-wide text-white"
          style={{
            fontSize: fontSize * 0.62,
            background: "#9146FF",
            verticalAlign: "middle",
          }}
        >
          @ you
        </span>
      )}
      {highlightSelf && (
        <span
          className="mr-1.5 inline-flex items-center rounded px-1 py-px font-bold uppercase tracking-wide text-black"
          style={{
            fontSize: fontSize * 0.62,
            background: "#1DB954",
            verticalAlign: "middle",
          }}
        >
          you
        </span>
      )}

      {showTimestamps && (
        <span
          className="text-white/40 mr-1.5"
          style={{ fontSize: fontSize * 0.75 }}
        >
          {time}
        </span>
      )}
      {showPlatform && (
        <span className="inline-flex align-middle mr-1.5 -mt-0.5">
          <PlatformIcon id={msg.platform} size={fontSize * 0.9} />
        </span>
      )}
      {msg.badges.map((b, i) => {
        const key = b.toLowerCase();
        const badge = BADGE_ICONS[key];
        if (!badge) return null;
        return (
          <span
            key={`${b}-${i}`}
            title={badge.label}
            className="mr-0.5 inline-flex items-center justify-center rounded"
            style={{
              fontSize: fontSize * 0.78,
              background: `${badge.color}22`,
              boxShadow: `inset 0 0 0 1px ${badge.color}55`,
              padding: "0 2px",
            }}
          >
            {badge.icon}
          </span>
        );
      })}
      <span className="font-bold" style={{ color: nameColor }}>
        {msg.username}
      </span>
      <span className="text-white/60">: </span>
      <span className="text-white">
        {msg.parts.map((p, i) =>
          p.type === "text" ? (
            <span key={i}>{p.text}</span>
          ) : (
            <img
              key={i}
              src={p.url}
              alt={p.name}
              title={p.name}
              className="inline-block align-middle mx-0.5"
              style={{ height: fontSize * 1.5 }}
              loading="lazy"
            />
          )
        )}
      </span>
    </div>
  );
}
