/**
 * Shared OBS Browser Source panel used by every overlay tab.
 *
 * Shows the URL + a one-click copy button so streamers can grab the
 * source without hunting through settings.
 */
import { useCallback, useState } from "react";

interface Props {
  title: string;
  description: string;
  url: string;
  /** Accent colour for the copy button (hex or CSS colour). */
  accentColor?: string;
  /** Optional note shown under the button. */
  note?: string;
  /** When false, the copy button is disabled and `disabledHint` is shown instead of the URL. */
  canCopy?: boolean;
  disabledHint?: string;
  copyLabel?: string;
}

export function BrowserSourceCard({
  title,
  description,
  url,
  accentColor = "#9146FF",
  note,
  canCopy = true,
  disabledHint,
  copyLabel = "Copy overlay URL",
}: Props) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    if (!canCopy) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — still show the URL so the user can select it */
    }
  }, [canCopy, url]);

  return (
    <section className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
      <h3 className="font-semibold text-sm uppercase tracking-wider text-white/60">
        {title}
      </h3>
      <p className="text-xs text-white/50 leading-relaxed">{description}</p>
      <div className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/60 break-all font-mono select-all">
        {canCopy ? url : (disabledHint ?? "Configure this module first to generate a URL.")}
      </div>
      <button
        onClick={copy}
        disabled={!canCopy}
        className="w-full py-2 rounded-lg font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
        style={{
          backgroundColor: accentColor,
          color: accentColor === "#1DB954" || accentColor === "#53FC18" ? "#000" : "#fff",
        }}
      >
        {copied ? "Copied! ✓" : copyLabel}
      </button>
      {note && <p className="text-[11px] text-white/40 leading-relaxed">{note}</p>}
    </section>
  );
}
