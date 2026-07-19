/**
 * Legacy OAuth callback path (redirect flow).
 * Clips now use Device Code auth — no redirect needed.
 * This page just explains that and links home.
 */
export function TwitchClipsCallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0e0e12] p-6 text-white">
      <div className="max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
        <h1 className="text-lg font-bold text-[#9146FF]">Twitch Clips</h1>
        <p className="mt-3 text-sm text-white/60">
          Clips login no longer uses a redirect URL. Open the{" "}
          <strong className="text-white/80">Clips</strong> tab and click{" "}
          <strong className="text-white/80">Connect Twitch (device code)</strong>{" "}
          instead — Twitch only needs a Client ID, not HTTPS.
        </p>
        <a
          href="/"
          className="mt-5 inline-block rounded-xl bg-[#9146FF] px-4 py-2 text-sm font-semibold text-white"
        >
          Back to Stream Control
        </a>
      </div>
    </div>
  );
}

export const TWITCH_CLIPS_TOKENS_KEY = "sc:twitch-clips:tokens";
