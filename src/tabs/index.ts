/**
 * Tab registry for the dashboard sidebar.
 */
import type { Tab } from "../types";
import { chatTab } from "./chat";
import { nowPlayingTab } from "./nowPlaying";
import { webhooksTab } from "./webhooks";
import { obsDashboardTab } from "./obsDashboard";
import { bridgeTab } from "./bridge";
import { clipsTab } from "./clips";
import { settingsTab } from "./settings";

/** Active dashboard tabs shown in the sidebar. */
export const TABS: Tab[] = [
  obsDashboardTab, // id: "obs", name: "OBS Dashboard"
  chatTab,
  nowPlayingTab,
  clipsTab,
  webhooksTab,
  bridgeTab,
  settingsTab,
];

export const MODULES = TABS;

/** Roadmap placeholders shown in the sidebar. */
export const COMING_SOON: { id: string; name: string }[] = [];
