import { useEffect, useState } from "react";

interface Props {
  /** What this hotkey triggers, used in the tooltip (e.g. "Mark moment"). */
  label: string;
  /** Stored combo string (e.g. "Ctrl+Shift+M"), or "" if unbound. */
  value: string;
  onChange: (next: string) => void;
}

/** Turns a keydown into a normalized combo string like "Ctrl+Shift+M". */
export function formatHotkeyEvent(e: KeyboardEvent): string | null {
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Meta");
  parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
  return parts.join("+");
}

function KeyIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <rect x="3" y="7" width="18" height="11" rx="2" />
      <path d="M7 11h.01M11 11h.01M15 11h.01M7 14h10" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Small pill showing a bound hotkey. Click to rebind — press any key
 * combo to assign it, Esc to cancel, Backspace/Delete to clear.
 */
export function HotkeyControl({ label, value, onChange }: Props) {
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!listening) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setListening(false);
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        onChange("");
        setListening(false);
        return;
      }
      const combo = formatHotkeyEvent(e);
      if (!combo) return;
      onChange(combo);
      setListening(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [listening, onChange]);

  return (
    <button
      type="button"
      onClick={() => setListening(true)}
      title={
        listening
          ? "Press a key combo (Esc to cancel, Backspace to clear)"
          : value
            ? `${label} hotkey: ${value} — click to rebind`
            : `Set a hotkey for ${label}`
      }
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
        listening
          ? "border-[#9146FF] bg-[#9146FF]/20 text-[#c9a8ff] animate-pulse"
          : value
            ? "border-white/15 bg-white/10 text-white/70 hover:bg-white/15"
            : "border-white/10 bg-white/5 text-white/35 hover:bg-white/10 hover:text-white/60"
      }`}
    >
      <KeyIcon />
      {listening ? "Press a key…" : value || "No hotkey"}
    </button>
  );
}
