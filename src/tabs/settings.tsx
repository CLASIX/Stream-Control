/**
 * Settings hub — shared inputs that used to live inside individual modules:
 * channel names and Twitch Client ID (for Clips).
 *
 * Sidebar tabs can be reordered via "Edit layout" at the bottom of the sidebar.
 */
import { useState } from "react";
import { useStore } from "../lib/store";
import type { Tab } from "../types";

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

const inputCls =
  "mt-1.5 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-[#9146FF]";

function SettingsModule() {
  const { settings, update } = useStore();
  const [showClientId, setShowClientId] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  const flashSaved = () => {
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1200);
  };

  const copyLayoutJson = () => {
    const layoutExport = {
      moduleOrder: settings.moduleOrder,
      obsModuleOrder: settings.obsModuleOrder,
      obsBoardLayout: settings.obsBoardLayout,
      obsAudienceOrder: settings.obsAudienceOrder,
      obsPerformanceOrder: settings.obsPerformanceOrder,
      chatModuleOrder: settings.chatModuleOrder,
      chatBoardLayout: settings.chatBoardLayout,
      spotifyModuleOrder: settings.spotifyModuleOrder,
      spotifyBoardLayout: settings.spotifyBoardLayout,
      clipsModuleOrder: settings.clipsModuleOrder,
      clipsBoardLayout: settings.clipsBoardLayout,
    };
    const jsonStr = JSON.stringify(layoutExport, null, 2);
    navigator.clipboard.writeText(jsonStr).then(() => {
      setCopyNotice("Layout JSON copied to your clipboard!");
      setTimeout(() => setCopyNotice(null), 4000);
    }).catch(() => {
      setCopyNotice("Could not copy automatically. Click Download Layout below instead.");
      setTimeout(() => setCopyNotice(null), 4000);
    });
  };

  const downloadBackupJson = () => {
    const jsonStr = JSON.stringify(settings, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stream-control-layout-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setCopyNotice("Backup file downloaded to your computer!");
    setTimeout(() => setCopyNotice(null), 4000);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(String(event.target?.result || ""));
        if (parsed && typeof parsed === "object") {
          update(parsed);
          setCopyNotice("Layout and settings restored successfully!");
          setTimeout(() => setCopyNotice(null), 4000);
        }
      } catch {
        setCopyNotice("Invalid or corrupted JSON file.");
        setTimeout(() => setCopyNotice(null), 4000);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-2xl">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <SettingsIcon />
          <div>
            <h2 className="text-2xl font-bold">Settings</h2>
            <p className="mt-1 text-sm text-white/50">
              Channels and API credentials used across Stream Control.
            </p>
          </div>
        </div>
        {savedFlash && (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-[11px] font-semibold text-emerald-200">
            Saved
          </span>
        )}
      </header>

      <div className="space-y-5">
        {/* Channels */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/55">
              Channels
            </h3>
            <p className="mt-1 text-[11px] text-white/40">
              Used by Chat Overlay, Clips, live viewer counts, and Discord webhooks.
            </p>
          </div>

          <label className="block text-xs text-white/65">
            <span className="flex items-center gap-2 font-medium">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#9146FF]" />
              Twitch channel
            </span>
            <input
              value={settings.twitchChannel}
              onChange={(e) => {
                update({ twitchChannel: e.target.value });
                flashSaved();
              }}
              placeholder="e.g. shroud"
              className={inputCls}
            />
          </label>

          <label className="block text-xs text-white/65">
            <span className="flex items-center gap-2 font-medium">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#53FC18]" />
              Kick channel
            </span>
            <input
              value={settings.kickChannel}
              onChange={(e) => {
                update({ kickChannel: e.target.value });
                flashSaved();
              }}
              placeholder="e.g. xqc (or chatroom ID)"
              className={inputCls}
            />
          </label>
        </section>

        {/* Twitch Client ID for Clips */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/55">
              Twitch API
            </h3>
            <p className="mt-1 text-[11px] leading-relaxed text-white/40">
              Client ID for the Clips module (Device Code login). Create an app at{" "}
              <a
                href="https://dev.twitch.tv/console/apps/create"
                target="_blank"
                rel="noreferrer"
                className="text-[#c9a8ff] hover:underline"
              >
                dev.twitch.tv
              </a>
              . Use redirect{" "}
              <code className="rounded bg-black/30 px-1 font-mono text-[10px] text-white/70">
                http://localhost
              </code>{" "}
              when registering (placeholder only).
            </p>
          </div>

          <label className="block text-xs text-white/65">
            Twitch Client ID
            <div className="mt-1.5 flex gap-2">
              <input
                type={showClientId ? "text" : "password"}
                value={settings.twitchClipsClientId}
                onChange={(e) => {
                  update({ twitchClipsClientId: e.target.value });
                  flashSaved();
                }}
                placeholder="paste Client ID"
                autoComplete="off"
                spellCheck={false}
                className={`${inputCls} mt-0 min-w-0 flex-1 font-mono`}
              />
              <button
                type="button"
                onClick={() => setShowClientId((v) => !v)}
                className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-white/60 hover:bg-white/10 hover:text-white"
                title={showClientId ? "Hide Client ID" : "Show Client ID"}
              >
                {showClientId ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {settings.twitchClipsClientId.trim() && !showClientId && (
            <p className="text-[10px] text-white/30">
              Saved · shown as dots for privacy. Click Show to reveal.
            </p>
          )}
        </section>

        {/* Edit layout hint & Sidebar Position */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/55">
            Edit layout &amp; Sidebar Position
          </h3>
          <p className="text-xs leading-relaxed text-white/45">
            To rearrange sidebar tabs and tiles: click{" "}
            <strong className="text-white/70">Edit layout</strong> at the bottom of the sidebar,
            then drag items where you want them. Click <strong className="text-white/70">Done editing</strong>{" "}
            when finished. All positions are saved automatically.
          </p>
          <div className="flex items-center justify-between pt-3 border-t border-white/5">
            <span className="text-xs text-white/70 font-semibold">Sidebar Dock Position</span>
            <button
              type="button"
              onClick={() => update({ sidebarRight: !settings.sidebarRight })}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition cursor-pointer"
            >
              {settings.sidebarRight ? "Right Side (Click for Left)" : "Left Side (Click for Right)"}
            </button>
          </div>
        </section>

        {/* Layout Backup & Share */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/60">
              Backup, Restore &amp; Share Layout
            </h3>
            <p className="mt-1 text-xs text-white/45 leading-relaxed">
              Export or import your custom layout coordinates and tab order. All layout files are in JSON (.json) format.
            </p>
          </div>

          {copyNotice && (
            <div className="rounded-xl border border-[#9146FF]/30 bg-[#9146FF]/15 px-4 py-2.5 text-xs font-semibold text-[#c9a8ff]">
              {copyNotice}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <button
              type="button"
              onClick={copyLayoutJson}
              className="rounded-xl bg-white/10 px-4 py-2.5 text-xs font-semibold text-white/80 hover:bg-white/20 transition-colors text-center"
            >
              Copy Layout
            </button>
            <button
              type="button"
              onClick={downloadBackupJson}
              className="rounded-xl bg-white/10 px-4 py-2.5 text-xs font-semibold text-white/80 hover:bg-white/20 transition-colors text-center"
            >
              Download Layout
            </button>
            <label className="rounded-xl bg-white/10 px-4 py-2.5 text-xs font-semibold text-white/80 hover:bg-white/20 transition-colors cursor-pointer text-center flex items-center justify-center">
              <span>Restore Layout</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleImportFile}
                className="hidden"
              />
            </label>
          </div>
        </section>
      </div>
    </div>
  );
}

export const settingsTab: Tab = {
  id: "settings",
  name: "Settings",
  icon: <SettingsIcon />,
  description: "Channels, blocked users, and API credentials.",
  Component: SettingsModule,
};

export const settingsModule = settingsTab;
