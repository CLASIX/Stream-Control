/**
 * Spotify "Now Playing" module.
 *
 * Mode 1: Local Player (Non-Premium Window-Title Reader)
 * - Default. Works out of the box, zero Developer setup, zero credentials,
 *   zero Spotify Premium required!
 * - Just play music in your local Spotify desktop app and the local server
 *   automatically fetches artwork and title, displaying it beautifully.
 *
 * Mode 2: Spotify Web API (Premium)
 * - Requires Client ID, custom Redirect URI setup, and a Premium subscription.
 *
 * The left-column cards below ("connection", "obsSource")
 * are drag-reorderable when global Edit Mode is on. The live preview stays
 * fixed on the right.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "../lib/store";
import { useSpotify } from "../hooks/useSpotify";
import { NowPlayingDisplay } from "../components/NowPlayingDisplay";
import { BrowserSourceCard } from "../components/BrowserSourceCard";
import { TileCard } from "../components/TileCard";
import { FreeformBoard, type FreeformBoardItem } from "../components/FreeformBoard";
import { buildNowPlayingOverlayUrl } from "../lib/overlayUrls";
import { applyOrder } from "../lib/reorder";
import { computeRecommendedRedirectUri } from "../lib/spotify";
import type { Tab } from "../types";

function SpotifyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#1DB954" aria-label="Spotify">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

function SpotifyModule() {
  const { settings, update } = useStore();
  const editMode = settings.editMode;
  const recommendedRedirectUri = useMemo(() => computeRecommendedRedirectUri(), []);
  const effectiveRedirectUri = settings.spotifyRedirectUri.trim() || recommendedRedirectUri;

  const [clientIdInput, setClientIdInput] = useState(settings.spotifyClientId);
  const [redirectUriInput, setRedirectUriInput] = useState(
    settings.spotifyRedirectUri || recommendedRedirectUri
  );

  const { auth, track, refreshToken, error, login, logout } = useSpotify({
    clientId: settings.spotifyClientId,
    redirectUri: effectiveRedirectUri,
    persist: true,
    handleCallback: true,
    mode: settings.nowPlayingMode,
  });

  useEffect(() => {
    if (refreshToken && refreshToken !== settings.spotifyRefreshToken) {
      update({ spotifyRefreshToken: refreshToken });
    }
  }, [refreshToken, settings.spotifyRefreshToken, update]);

  const commitClientId = useCallback(() => {
    const trimmed = clientIdInput.trim();
    if (trimmed !== settings.spotifyClientId) {
      update({ spotifyClientId: trimmed });
    }
  }, [clientIdInput, settings.spotifyClientId, update]);

  const commitRedirectUri = useCallback(() => {
    const trimmed = redirectUriInput.trim();
    if (trimmed !== settings.spotifyRedirectUri) {
      update({ spotifyRedirectUri: trimmed });
    }
  }, [redirectUriInput, settings.spotifyRedirectUri, update]);

  const useRecommendedRedirect = useCallback(() => {
    setRedirectUriInput(recommendedRedirectUri);
    update({ spotifyRedirectUri: recommendedRedirectUri });
  }, [recommendedRedirectUri, update]);

  const handleLogout = useCallback(() => {
    logout();
    update({ spotifyRefreshToken: "" });
  }, [logout, update]);

  const effectiveRefresh = refreshToken || settings.spotifyRefreshToken || undefined;

  const overlayUrl = useMemo(
    () =>
      buildNowPlayingOverlayUrl({
        clientId: settings.spotifyClientId,
        refreshToken: settings.nowPlayingMode === "spotify-api" ? effectiveRefresh : undefined,
        mode: settings.nowPlayingMode,
      }),
    [settings.spotifyClientId, effectiveRefresh, settings.nowPlayingMode]
  );

  const canCopyOverlay =
    settings.nowPlayingMode === "local-player" ||
    Boolean(settings.spotifyClientId.trim() && effectiveRefresh);

  const statusLabel = {
    idle: { text: "Not connected", dot: "bg-slate-500" },
    connecting: { text: "Connecting…", dot: "bg-amber-400 animate-pulse" },
    authenticated: { text: "Connected to Spotify", dot: "bg-emerald-400" },
    error: { text: "Connection error", dot: "bg-red-500" },
  }[auth];

  // ---- Module cards (order persisted + drag-reorderable) ----
  const cards: { id: string; node: ReactNode }[] = [
    {
      id: "connection",
      node:
        settings.nowPlayingMode === "local-player" ? (
          <TileCard title="Setup Status" editMode={editMode}>
            <div className="flex items-center gap-2 text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-lg p-3 leading-relaxed">
              <span>✓ Works with Free Spotify accounts out of the box. No Developer setup or login required!</span>
            </div>
            <p className="text-xs text-white/50 leading-relaxed">
              To read Spotify, make sure to launch the app using:
            </p>
            <div className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/60 font-mono">
              Launch Stream Control.bat
            </div>
            <p className="text-xs text-white/40 leading-relaxed">
              The local desktop server automatically reads Spotify's window title (Windows) or
              AppleScript (Mac) and looks up cover art dynamically.
            </p>
          </TileCard>
        ) : (
          <TileCard title="Spotify App" editMode={editMode}>
            <div>
              <label className="text-sm mb-1.5 block font-medium">Client ID</label>
              <input
                value={clientIdInput}
                onChange={(e) => setClientIdInput(e.target.value)}
                onBlur={commitClientId}
                placeholder="paste your Spotify Client ID"
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-[#1DB954] transition-colors"
              />
              <p className="text-[11px] text-white/40 mt-1.5 leading-relaxed">
                Create an app at{" "}
                <a
                  href="https://developer.spotify.com/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#1DB954] hover:underline"
                >
                  developer.spotify.com
                </a>
                . Client secret is not needed (PKCE).
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5 gap-3">
                <label className="text-sm font-medium">Redirect URI</label>
                <button
                  type="button"
                  onClick={useRecommendedRedirect}
                  className="text-[11px] text-[#1DB954] hover:underline"
                >
                  Use recommended
                </button>
              </div>
              <input
                value={redirectUriInput}
                onChange={(e) => setRedirectUriInput(e.target.value)}
                onBlur={commitRedirectUri}
                placeholder="http://127.0.0.1:8080/auth/spotify/callback"
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-[#1DB954] transition-colors"
              />
              <p className="text-[11px] text-white/40 mt-1.5 leading-relaxed">
                Must exactly match the redirect URI registered in your Spotify app.
              </p>
              <p className="text-[11px] text-white/30 mt-1 leading-relaxed">
                Recommended for this device: <span className="font-mono">{recommendedRedirectUri}</span>
              </p>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="flex items-center gap-1.5 text-xs">
                <span className={`w-2 h-2 rounded-full ${statusLabel.dot}`} />
                {statusLabel.text}
              </span>
              {auth === "authenticated" || settings.spotifyRefreshToken ? (
                <button
                  onClick={handleLogout}
                  className="text-xs text-white/50 hover:text-red-400 transition-colors"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={() => void login()}
                  disabled={!settings.spotifyClientId || !effectiveRedirectUri}
                  className="px-3 py-1.5 rounded-lg bg-[#1DB954] hover:bg-[#1ed760] disabled:opacity-40 disabled:cursor-not-allowed text-black text-xs font-semibold transition-colors"
                >
                  Connect Spotify
                </button>
              )}
            </div>
          </TileCard>
        ),
    },
    {
      id: "obsSource",
      node: (
        <div className="space-y-3">
          <BrowserSourceCard
            title="OBS Browser Source — Now Playing"
            description="In OBS: Sources → + → Browser → paste this URL. The card scales crisply to whatever Width × Height you set on the Browser Source."
            url={overlayUrl}
            accentColor="#1DB954"
            copyLabel="Copy Now Playing URL"
            canCopy={canCopyOverlay}
            disabledHint="Connect Spotify first — the overlay URL needs your session."
            note="Chat overlay is set up separately in the Chat Overlay module."
          />
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-xs text-red-300 leading-relaxed">
              <strong className="block mb-1">Spotify error:</strong>
              {error}
              {error.includes("invalid_grant") && (
                <span className="block mt-2 text-red-200/70">
                  Your session expired. Click Disconnect, then Connect Spotify again, then re-copy the overlay URL.
                </span>
              )}
            </div>
          )}
          {settings.nowPlayingMode === "spotify-api" && (
            <p className="text-[11px] text-white/40 leading-relaxed">
              Overlay not showing in OBS? Add <span className="font-mono text-white/60">&amp;debug=1</span>{" "}
              to the end of the Now Playing URL and open it in a browser to see the connection status.
            </p>
          )}
        </div>
      ),
    },
    {
      id: "livePreview",
      node: (
        <TileCard title="Live preview" editMode={editMode}>
          <div className="flex flex-col items-center justify-center p-4 bg-black/40 gap-3 rounded-xl min-h-[140px] w-full">
            {auth !== "authenticated" && settings.nowPlayingMode === "spotify-api" ? (
              <div className="text-center text-white/40 text-sm py-6 px-4">
                {auth === "connecting"
                  ? "Finishing the connection to Spotify…"
                  : auth === "error"
                    ? "Couldn't authenticate. Double-check the Client ID and Redirect URI in your Spotify app settings, then try again."
                    : "Connect to Spotify to see the preview."}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 w-full">
                <div className="w-[460px] max-w-full" style={{ height: 90 }}>
                  <NowPlayingDisplay track={track} preview />
                </div>
                {track && (
                  <p className="text-xs text-white/45 text-center max-w-[440px] truncate mt-1">
                    {track.isPlaying ? `${track.name} — ${track.artist}` : "Paused"}
                  </p>
                )}
              </div>
            )}
          </div>
        </TileCard>
      ),
    },
  ];

  const boardItems: FreeformBoardItem[] = applyOrder(
    cards,
    settings.spotifyModuleOrder || [],
    (c) => c.id
  ).map((c, i) => ({
    id: c.id,
    title:
      c.id === "connection"
        ? "Connection"
        : c.id === "obsSource"
          ? "OBS Source"
          : c.id === "livePreview"
            ? "Live preview"
            : c.id,
    node: c.node,
    defaultW: c.id === "livePreview" ? 520 : 360,
    defaultX: c.id === "livePreview" ? 380 : 0,
    defaultY: c.id === "livePreview" ? 0 : i * 320,
  }));

  return (
    <div className="w-full min-w-0">
      <header className="mb-4 flex items-center justify-between gap-3 flex-wrap pr-[150px] sm:pr-[160px] pt-6">
        <div className="flex items-center gap-3">
          <SpotifyIcon />
          <div>
            <h2 className="text-2xl font-bold">Now Playing</h2>
            <p className="text-white/50 text-sm mt-1">
              Show what music you're playing on Spotify on your stream.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {editMode && (
            <span className="rounded-full bg-[#1DB954]/15 border border-[#1DB954]/30 px-3 py-1.5 text-[11px] font-semibold text-[#8fe0b3]">
              Edit mode — drag cards anywhere
            </span>
          )}
          <div className="bg-white/5 border border-white/10 rounded-lg p-1 flex gap-1">
            <button
              onClick={() => update({ nowPlayingMode: "local-player" })}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                settings.nowPlayingMode === "local-player"
                  ? "bg-[#1DB954] text-black"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              Local Player (Free)
            </button>
            <button
              onClick={() => update({ nowPlayingMode: "spotify-api" })}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                settings.nowPlayingMode === "spotify-api"
                  ? "bg-[#1DB954] text-black"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              Spotify Web API (Premium)
            </button>
          </div>
        </div>
      </header>

      <FreeformBoard
        items={boardItems}
        layout={settings.spotifyBoardLayout || {}}
        onChange={(spotifyBoardLayout) => update({ spotifyBoardLayout })}
        editMode={editMode}
        minHeight={680}
      />
    </div>
  );
}

export const nowPlayingTab: Tab = {
  id: "spotify",
  name: "Now Playing",
  icon: <SpotifyIcon />,
  description: "Dedicated Spotify now-playing overlay for OBS.",
  Component: SpotifyModule,
};

export const spotifyModule = nowPlayingTab;
