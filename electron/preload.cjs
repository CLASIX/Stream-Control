const { contextBridge, ipcRenderer } = require("electron");

/**
 * Safe, explicit APIs exposed to the renderer.
 */
contextBridge.exposeInMainWorld("streamControl", {
  isDesktop: true,
  openPopout: (url) => ipcRenderer.invoke("open-popout", url),
  closePopout: () => ipcRenderer.invoke("close-popout"),
  isPopoutOpen: () => ipcRenderer.invoke("is-popout-open"),
  onPopoutStatus: (callback) => {
    const handler = (_event, isOpen) => callback(Boolean(isOpen));
    ipcRenderer.on("popout:status", handler);
    return () => ipcRenderer.removeListener("popout:status", handler);
  },
  hotkeys: {
    configure: (bindings) => ipcRenderer.invoke("hotkeys:configure", bindings),
  },
  webhooks: {
    list: () => ipcRenderer.invoke("webhooks:list"),
    save: (config) => ipcRenderer.invoke("webhooks:save", config),
    delete: (id) => ipcRenderer.invoke("webhooks:delete", id),
    test: (config) => ipcRenderer.invoke("webhooks:test", config),
    check: (id) => ipcRenderer.invoke("webhooks:check", id),
    previewProfile: (input) =>
      ipcRenderer.invoke("webhooks:preview-profile", input),
    onUpdated: (callback) => {
      const handler = (_event, configs) => callback(configs);
      ipcRenderer.on("webhooks:updated", handler);
      return () => ipcRenderer.removeListener("webhooks:updated", handler);
    },
  },
  twitchWebhook: {
    getSessionId: () => ipcRenderer.invoke("twitch:get-session-id"),
    openConsole: () => ipcRenderer.invoke("twitch:open-console"),
    onTrigger: (callback) => {
      const handler = (_event, item) => callback(item);
      ipcRenderer.on("twitch:webhook-trigger", handler);
      return () => ipcRenderer.removeListener("twitch:webhook-trigger", handler);
    },
  },
  bridge: {
    setConfig: (cfg) => ipcRenderer.invoke("bridge:set-config", cfg),
    getConfig: () => ipcRenderer.invoke("bridge:get-config"),
    /**
     * Subscribe to bridge actions from the HTTP server.
     * Handler must return { ok, result?, error? }.
     */
    onAction: (handler) => {
      const listener = async (_event, request) => {
        let response;
        try {
          response = await handler({
            action: request.action,
            params: request.params || {},
          });
        } catch (e) {
          response = {
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          };
        }
        ipcRenderer.send("bridge:action-result", {
          requestId: request.requestId,
          ok: Boolean(response?.ok),
          result: response?.result,
          error: response?.error,
        });
      };
      ipcRenderer.on("bridge:action", listener);
      return () => ipcRenderer.removeListener("bridge:action", listener);
    },
  },
});
