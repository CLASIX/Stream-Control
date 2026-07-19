import type { ConnStatus } from "../types";

const COLORS: Record<ConnStatus, string> = {
  idle: "bg-slate-500",
  connecting: "bg-amber-400 animate-pulse",
  connected: "bg-emerald-400",
  error: "bg-red-500",
};

const LABELS: Record<ConnStatus, string> = {
  idle: "Off",
  connecting: "Connecting…",
  connected: "Live",
  error: "Error",
};

/** Small coloured dot + label used next to each platform's channel input. */
export function StatusDot({
  status,
  label = true,
}: {
  status: ConnStatus;
  /** Set false to render just the dot with no text (e.g. next to a logo). */
  label?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-white/70">
      <span className={`w-2 h-2 rounded-full ${COLORS[status]}`} />
      {label && LABELS[status]}
    </span>
  );
}
