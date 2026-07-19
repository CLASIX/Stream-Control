/**
 * App shell.
 *
 * Four modes:
 *   - Dashboard: / (no overlay param)
 *   - Chat overlay: ?overlay=chat&twitch=…&kick=…
 *   - Now Playing overlay: ?overlay=now-playing&client=…&refresh=…&size=…
 *   - Spotify callback: /auth/spotify/callback?code=…&state=…
 *
 * Tabs (the sidebar entries) are drag-reorderable when Edit layout mode is on —
 * see `Sidebar`. The same Edit layout mode flag is read by each tab's own
 * component to enable dragging its internal tiles / list items.
 */
import { useMemo, useState } from "react";
import { StoreProvider, useStore } from "./lib/store";
import { ChatSessionProvider } from "./lib/chatSession";
import { TABS, COMING_SOON } from "./tabs";
import { applyOrder } from "./lib/reorder";
import { Sidebar } from "./components/Sidebar";
import { ChatOverlay } from "./components/ChatOverlay";
import { SpotifyOverlay } from "./components/SpotifyOverlay";
import { SpotifyCallback } from "./components/SpotifyCallback";
import { PopoutChat } from "./components/PopoutChat";
import { BridgeHost } from "./components/BridgeHost";
import { TwitchClipsCallback } from "./components/TwitchClipsCallback";
import { detectOverlay } from "./lib/overlayUrls";

function Shell() {
  const { settings, update } = useStore();
  const orderedTabs = useMemo(
    () => applyOrder(TABS, settings.tabOrder || settings.moduleOrder || [], (t) => t.id),
    [settings.tabOrder, settings.moduleOrder]
  );

  const [activeId, setActiveId] = useState(orderedTabs[0].id);
  const active = orderedTabs.find((t) => t.id === activeId) ?? orderedTabs[0];
  const Active = active.Component;

  const navTabs = useMemo(
    () => [
      ...orderedTabs.map((t) => ({ id: t.id, name: t.name, icon: t.icon, active: true })),
      ...COMING_SOON.map((t) => ({
        id: t.id,
        name: t.name,
        icon: <span className="text-white/30 text-xs">·</span>,
        active: false,
      })),
    ],
    [orderedTabs]
  );

  return (
    <div className="flex h-screen w-screen bg-[#0e0e12] text-white overflow-hidden select-none">
      {/* Always mounted — executes streamer.bot bridge actions via IPC */}
      <BridgeHost />
      <Sidebar
        tabs={navTabs}
        activeId={activeId}
        onSelect={setActiveId}
        editMode={settings.editMode}
        onToggleEditMode={() => update({ editMode: !settings.editMode })}
        onReorder={(newOrder) => update({ tabOrder: newOrder, moduleOrder: newOrder })}
        collapsed={settings.sidebarCollapsed}
        onToggleCollapsed={() => update({ sidebarCollapsed: !settings.sidebarCollapsed })}
        sidebarRight={Boolean(settings.sidebarRight)}
        onToggleSide={() => update({ sidebarRight: !settings.sidebarRight })}
      />
      <main className={`flex-1 h-screen overflow-auto min-w-0 relative flex flex-col ${settings.sidebarRight ? "order-1" : "order-2"}`}>
        {/* Invisible top drag bar for frameless / hidden-titlebar desktop window spanning main top 36px */}
        <div
          className="h-9 w-full shrink-0 select-none bg-transparent absolute top-0 left-0 right-0 z-50 pointer-events-auto"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        />
        <div className="flex-1 min-h-0 overflow-auto pt-4 px-6 pb-6 lg:pt-5 lg:px-8 lg:pb-8 relative z-10">
          <Active />
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);

  // Spotify OAuth callback: /auth/spotify/callback?code=…&state=…
  // Spotify may also redirect here with ?error=… when access is denied
  // or the app is blocked, so route all callback-path visits here.
  if (window.location.pathname.includes("/auth/spotify/callback")) {
    return <SpotifyCallback />;
  }

  if (window.location.pathname.includes("/auth/twitch/clips/callback")) {
    return <TwitchClipsCallback />;
  }

  const overlay = detectOverlay(params);

  if (overlay === "now-playing") {
    return <SpotifyOverlay params={params} />;
  }

  if (overlay === "chat") {
    return <ChatOverlay params={params} />;
  }

  if (overlay === "popout") {
    return <PopoutChat params={params} />;
  }

  return (
    <StoreProvider>
      <ChatSessionProvider>
        <Shell />
      </ChatSessionProvider>
    </StoreProvider>
  );
}
