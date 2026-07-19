/**
 * Layout preset system.
 *
 * A preset is a named snapshot of the *appearance/layout* settings —
 * NOT credentials or channel names. This lets you switch between looks
 * (e.g. "Gaming top-right", "Just Chatting bottom-left") in one click
 * without disconnecting Spotify or re-typing your channels.
 *
 * Presets are stored in localStorage separately from live settings so
 * they survive independently.
 */
import type { Settings } from "../types";

const PRESETS_KEY = "multichat:presets:v1";

/**
 * Which settings fields a preset captures. Deliberately excludes:
 *   - channel names (twitchChannel, kickChannel)
 *   - Spotify credentials (clientId, redirectUri, refreshToken)
 * so applying a preset never logs you out or wipes your channels.
 */
export const PRESET_FIELDS = [
  "fontSize",
  "showTimestamps",
  "showPlatform",
  "chatAnchor",
  "chatSlideFrom",
  "chatFont",
  "nowPlayingMode",
] as const satisfies readonly (keyof Settings)[];

export type PresetData = Pick<Settings, (typeof PRESET_FIELDS)[number]>;

export interface Preset {
  id: string;
  name: string;
  data: PresetData;
}

/** Pull just the preset-relevant fields out of full settings. */
export function extractPresetData(settings: Settings): PresetData {
  const data = {} as PresetData;
  for (const key of PRESET_FIELDS) {
    // @ts-expect-error indexed assignment across the picked union is safe here
    data[key] = settings[key];
  }
  return data;
}

export function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePresets(presets: Preset[]): void {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {
    /* storage unavailable — ignore */
  }
}

export function createPreset(name: string, settings: Settings): Preset {
  return {
    id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim() || "Untitled preset",
    data: extractPresetData(settings),
  };
}
