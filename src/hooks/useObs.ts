/**
 * React hook that connects to the shared {@link ObsClient} instance and syncs its state across the app.
 *
 * Actions (setScene, toggleSource, etc.) are wrapped so rejected promises
 * (OBS returned an error, or we're not connected) surface as a readable
 * `error` string instead of an unhandled rejection.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ObsClient, type ObsConnStatus, type ObsState } from "../lib/obsClient";

export const sharedObsClient = new ObsClient();

export function useObs() {
  const [status, setStatus] = useState<ObsConnStatus>(() => sharedObsClient.getStatus());
  const [statusMessage, setStatusMessage] = useState<string | undefined>();
  const [state, setState] = useState<ObsState>(() => sharedObsClient.getState());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatus(sharedObsClient.getStatus());
    setState(sharedObsClient.getState());

    const offStatus = sharedObsClient.onStatus((s, msg) => {
      setStatus(s);
      setStatusMessage(msg);
    });
    const offState = sharedObsClient.onState(setState);

    return () => {
      offStatus();
      offState();
    };
  }, []);

  const connect = useCallback((host: string, port: number, password: string) => {
    setError(null);
    sharedObsClient.connect(host, port, password);
  }, []);

  const disconnect = useCallback(() => {
    sharedObsClient.disconnect();
  }, []);

  /** Run an action, surfacing any rejection as a readable error message. */
  const run = useCallback((fn: (client: ObsClient) => Promise<void>) => {
    fn(sharedObsClient).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const actions = useMemo(
    () => ({
      setScene: (name: string) => run((c) => c.setCurrentScene(name)),
      setPreviewScene: (name: string) => run((c) => c.setPreviewScene(name)),
      setVerticalScene: (name: string) => run((c) => c.setCurrentScene(name, c.getState().verticalCanvasUuid || undefined)),
      setVerticalPreviewScene: (name: string) => run((c) => c.setPreviewScene(name, c.getState().verticalCanvasUuid || undefined)),
      triggerTransition: () => run((c) => c.triggerStudioTransition()),
      setStudioMode: (enabled: boolean) => run((c) => c.setStudioMode(enabled)),
      toggleSceneItem: (id: number, enabled: boolean, scene?: string, canvasUuid?: string | null) => run((c) => c.toggleSceneItem(id, enabled, scene, canvasUuid)),
      toggleVerticalSceneItem: (id: number, enabled: boolean, scene?: string) => run((c) => c.toggleSceneItem(id, enabled, scene, c.getState().verticalCanvasUuid || undefined)),
      setMute: (name: string, muted: boolean) => run((c) => c.setMute(name, muted)),
      setVolume: (name: string, db: number) => run((c) => c.setVolume(name, db)),
      startStream: () => run((c) => c.startStream()),
      stopStream: () => run((c) => c.stopStream()),
      startRecord: () => run((c) => c.startRecord()),
      stopRecord: () => run((c) => c.stopRecord()),
      pauseRecord: () => run((c) => c.pauseRecord()),
      resumeRecord: () => run((c) => c.resumeRecord()),
      startVirtualCam: () => run((c) => c.startVirtualCam()),
      stopVirtualCam: () => run((c) => c.stopVirtualCam()),
      startReplayBuffer: () => run((c) => c.startReplayBuffer()),
      stopReplayBuffer: () => run((c) => c.stopReplayBuffer()),
      saveReplayBuffer: () => run((c) => c.saveReplayBuffer()),
    }),
    [run]
  );

  return { status, statusMessage, state, error, clearError: () => setError(null), connect, disconnect, actions, client: sharedObsClient };
}
