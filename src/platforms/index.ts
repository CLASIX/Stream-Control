/**
 * Platform registry.
 *
 * This is the single source of truth for "which platforms does the app
 * support". The chat hook iterates this list and instantiates one
 * connector per platform that has a non-empty channel configured.
 *
 * To add a new platform:
 *   1. Add its id to `PlatformId` in `src/types.ts`.
 *   2. Create `src/platforms/<id>.ts` implementing `PlatformConnector`.
 *   3. Add it to the array below.
 *
 * That's it — the chat hook, settings UI, and overlay will pick it up
 * automatically (you'll just need to add a channel input for it in the
 * Chat module's settings panel).
 */
import { TwitchConnector } from "./twitch";
import { KickConnector } from "./kick";
import type { PlatformConnector } from "../types";

export interface PlatformDescriptor {
  id: PlatformConnector["id"];
  name: string;
  color: string;
  /** Factory that creates a fresh connector instance. */
  create: () => PlatformConnector;
}

export const PLATFORMS: PlatformDescriptor[] = [
  {
    id: "twitch",
    name: "Twitch",
    color: "#9146FF",
    create: () => new TwitchConnector(),
  },
  {
    id: "kick",
    name: "Kick",
    color: "#53FC18",
    create: () => new KickConnector(),
  },
];
