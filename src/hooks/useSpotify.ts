/**
 * React hook that unified both Spotify trackers.
 *
 * 1) Mode "spotify-api": (Requires Premium).
 *    Uses the official Spotify Web API (PKCE OAuth).
 *
 * 2) Mode "local-player": (Works without Premium).
 *    Queries the local server's `/api/local-track` endpoint. The local
 *    desktop server (on port 8080) automatically polls the running Spotify
 *    app's window title (Windows) or AppleScript (Mac) and fetches matching
 *    artwork from iTunes.
 */
import { useEffect, useRef, useState } from "react";
import {
  SpotifyClient,
  type SpotifyAuthState,
  type SpotifyTrack,
} from "../lib/spotify";

export interface UseSpotifyOptions {
  clientId: string;
  redirectUri?: string;
  seedRefreshToken?: string;
  persist?: boolean;
  handleCallback?: boolean;
  /** "spotify-api" | "local-player" */
  mode?: "spotify-api" | "local-player";
}

export function useSpotify({
  clientId,
  redirectUri,
  seedRefreshToken,
  persist = true,
  handleCallback = true,
  mode = "local-player",
}: UseSpotifyOptions) {
  const clientRef = useRef<SpotifyClient | null>(null);
  const [auth, setAuth] = useState<SpotifyAuthState>("idle");
  const [track, setTrack] = useState<SpotifyTrack | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // --- Mode 1: Spotify Web API ---
  useEffect(() => {
    if (mode !== "spotify-api") return;

    const client = new SpotifyClient({
      clientId,
      redirectUri,
      seedRefreshToken,
      persist,
    });
    clientRef.current = client;

    const offAuth = client.onAuth((state) => {
      setAuth(state);
      setRefreshToken(client.getRefreshToken());
    });
    const offTrack = client.onTrack((t) => {
      setTrack(t);
      if (t) setError(null);
    });
    const offError = client.onError(setError);

    setAuth(client.getAuthState());
    setRefreshToken(client.getRefreshToken());

    if (handleCallback) {
      void client.handleCallback().then(() => {
        setAuth(client.getAuthState());
        setRefreshToken(client.getRefreshToken());
      });
    }

    return () => {
      offAuth();
      offTrack();
      offError();
      client.stopPolling();
    };
  }, [clientId, redirectUri, seedRefreshToken, persist, handleCallback, mode]);

  useEffect(() => {
    if (mode !== "spotify-api") return;
    const client = clientRef.current;
    if (!client) return;
    if (auth === "authenticated") {
      client.startPolling();
    } else {
      client.stopPolling();
      setTrack(null);
    }
  }, [auth, mode]);

  // --- Mode 2: Local Player (Non-Premium Title Reader) ---
  useEffect(() => {
    if (mode !== "local-player") return;

    // Both the dashboard and OBS overlays serve from the same local server
    // (http://127.0.0.1:8080), so a relative path is extremely reliable.
    const pollUrl = "/api/local-track";
    let active = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    setAuth("authenticated");
    setError(null);

    const poll = async () => {
      try {
        const res = await fetch(pollUrl);
        if (!active) return;
        if (res.ok) {
          const data: SpotifyTrack = await res.json();
          // Only update track if it has actually changed or state changed
          setTrack((prev) => {
            const hasChanged =
              !prev ||
              prev.name !== data.name ||
              prev.artist !== data.artist ||
              prev.isPlaying !== data.isPlaying ||
              prev.albumArt !== data.albumArt;
            return hasChanged ? data : prev;
          });
        }
      } catch (err) {
        if (!active) return;
        // In clean browser mode (no Electron running), print a helpful fallback.
        setError(
          "Local player is offline. Please make sure to launch the app using 'Launch Stream Control.bat' on your PC so the local desktop server can read Spotify's window title."
        );
        setTrack(null);
      }
    };

    void poll();
    // Match the desktop local-track poll (~1s) so the card switches quickly.
    timer = setInterval(poll, 1000);

    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [mode]);

  return {
    auth,
    track,
    refreshToken,
    error,
    login: () => clientRef.current?.login(),
    logout: () => clientRef.current?.logout(),
  };
}
export type { SpotifyAuthState, SpotifyTrack };
