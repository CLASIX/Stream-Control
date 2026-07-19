/**
 * Spotify OAuth callback handler.
 *
 * When Spotify redirects to `/auth/spotify/callback?code=...&state=...`,
 * this component picks up the code, exchanges it for tokens via the
 * SpotifyClient, then redirects the user back to the main dashboard.
 *
 * This fixes the "page cannot be displayed" issue — the app now has a
 * real handler for the callback path.
 */
import { useEffect, useState } from "react";
import { SpotifyClient } from "../lib/spotify";

export function SpotifyCallback() {
  const [status, setStatus] = useState<"working" | "done" | "error">("working");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const spotifyError = params.get("error");
      const spotifyErrorDescription = params.get("error_description");

      if (spotifyError) {
        setStatus("error");
        setErrorMsg(
          spotifyErrorDescription ||
            `Spotify returned an error: ${spotifyError}. If Spotify says your application is blocked because you do not have Premium, the Spotify Web API cannot be used by this app until the app owner account has Premium.`
        );
        return;
      }

      if (!params.get("code")) {
        setStatus("error");
        setErrorMsg("Spotify did not return an authorization code. Try connecting again from the dashboard.");
        return;
      }

      // We need the client ID and redirect URI from the pending auth session.
      const pendingRaw = sessionStorage.getItem("sc:spotify:pending");
      if (!pendingRaw) {
        setStatus("error");
        setErrorMsg("No pending Spotify login found. Try connecting again from the dashboard.");
        return;
      }

      let pending: { redirectUri?: string };
      try {
        pending = JSON.parse(pendingRaw);
      } catch {
        setStatus("error");
        setErrorMsg("Corrupt session data. Try connecting again from the dashboard.");
        return;
      }

      // We need the client ID from localStorage settings.
      let clientId = "";
      try {
        const settingsRaw = localStorage.getItem("multichat:settings:v1");
        if (settingsRaw) {
          const settings = JSON.parse(settingsRaw);
          clientId = settings.spotifyClientId ?? "";
        }
      } catch {
        // ignore
      }

      if (!clientId) {
        setStatus("error");
        setErrorMsg("No Spotify Client ID found. Go back to the dashboard and enter it first.");
        return;
      }

      const client = new SpotifyClient({
        clientId,
        redirectUri: pending.redirectUri,
        persist: true,
      });

      await client.handleCallback();
      const state = client.getAuthState();

      if (state === "authenticated") {
        setStatus("done");
        // Redirect back to the main dashboard.
        window.location.href = window.location.origin + "/";
      } else {
        setStatus("error");
        setErrorMsg(
          "Spotify authentication failed. Make sure the Client ID and Redirect URI in the app match what's in your Spotify Developer Dashboard."
        );
      }
    };

    run();
  }, []);

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#0e0e12] text-white">
      <div className="text-center max-w-md p-6">
        {status === "working" && (
          <>
            <div className="w-8 h-8 border-2 border-[#1DB954] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white/70">Connecting to Spotify…</p>
          </>
        )}
        {status === "done" && (
          <>
            <div className="text-4xl mb-4">✓</div>
            <p className="text-[#1DB954] font-semibold">Connected!</p>
            <p className="text-white/50 text-sm mt-2">Redirecting to the dashboard…</p>
          </>
        )}
        {status === "error" && (
          <>
            <div className="text-4xl mb-4">✕</div>
            <p className="text-red-400 font-semibold mb-2">Connection failed</p>
            <p className="text-white/50 text-sm">{errorMsg}</p>
            <button
              onClick={() => (window.location.href = window.location.origin + "/")}
              className="mt-4 px-4 py-2 bg-white/10 rounded-lg text-sm hover:bg-white/20 transition-colors"
            >
              Back to dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}
