/**
 * Chat overlay styling options: fonts and animation orientation.
 *
 * Fonts are loaded from Google Fonts on demand (works in OBS browser
 * sources too — they have full network access). "default" uses the
 * system font stack and needs no network.
 *
 * To add a font: add an entry to CHAT_FONTS with its Google Fonts
 * family spec, and it appears in the dashboard picker automatically.
 */

export interface ChatFont {
  id: string;
  label: string;
  /** CSS font-family value. */
  family: string;
  /** Google Fonts family spec (null = system font, no loading needed). */
  google: string | null;
}

export const CHAT_FONTS: ChatFont[] = [
  {
    id: "default",
    label: "Default (System)",
    family: "ui-sans-serif, system-ui, -apple-system, sans-serif",
    google: null,
  },
  { id: "inter", label: "Inter (clean)", family: "'Inter', sans-serif", google: "Inter:wght@400;600;700" },
  { id: "poppins", label: "Poppins (rounded)", family: "'Poppins', sans-serif", google: "Poppins:wght@400;600;700" },
  { id: "nunito", label: "Nunito (soft)", family: "'Nunito', sans-serif", google: "Nunito:wght@400;700;800" },
  { id: "rubik", label: "Rubik (modern)", family: "'Rubik', sans-serif", google: "Rubik:wght@400;600;700" },
  { id: "bangers", label: "Bangers (comic)", family: "'Bangers', cursive", google: "Bangers" },
  { id: "comic", label: "Comic Neue", family: "'Comic Neue', cursive", google: "Comic+Neue:wght@400;700" },
  { id: "pressstart", label: "Press Start 2P (retro)", family: "'Press Start 2P', monospace", google: "Press+Start+2P" },
  { id: "jetbrains", label: "JetBrains Mono (code)", family: "'JetBrains Mono', monospace", google: "JetBrains+Mono:wght@400;700" },
];

export function getChatFont(id: string): ChatFont {
  return CHAT_FONTS.find((f) => f.id === id) ?? CHAT_FONTS[0];
}

const loaded = new Set<string>();

/** Inject the Google Fonts stylesheet for a font (once per page). */
export function ensureChatFontLoaded(id: string): void {
  const font = getChatFont(id);
  if (!font.google || loaded.has(font.id)) return;
  loaded.add(font.id);

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${font.google}&display=swap`;
  document.head.appendChild(link);
}

/** Where the chat feed is pinned vertically in the OBS source. */
export type ChatAnchor = "top" | "bottom";
/** Which side messages slide in from. */
export type ChatSlideFrom = "left" | "right";
