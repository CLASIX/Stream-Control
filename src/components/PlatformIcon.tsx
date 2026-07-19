/**
 * Platform brand icons. Kept separate from connectors so SVGs don't
 * clutter the connection logic.
 */
import type { PlatformId } from "../types";

export function TwitchIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#9146FF" aria-label="Twitch">
      <path d="M2.149 0 0.537 4.119v16.836h5.731V24h3.224l3.045-3.045h4.657l6.269-6.269V0H2.149zm19.164 13.612-3.582 3.582h-5.731l-3.045 3.045v-3.045H4.129V2.149h17.184v11.463zM17.687 6.269v6.269h-2.149V6.269h2.149zm-5.731 0v6.269H9.807V6.269h2.149z" />
    </svg>
  );
}

export function KickIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#53FC18" aria-label="Kick">
      <path d="M1.333 0h8v5.333H12V2.667h2.667V0h8v8H20v2.667h-2.667v2.666H20V16h2.667v8h-8v-2.667H12v-2.666H9.333V24h-8V0z" />
    </svg>
  );
}

export function PlatformIcon({
  id,
  size = 16,
}: {
  id: PlatformId;
  size?: number;
}) {
  return id === "twitch" ? (
    <TwitchIcon size={size} />
  ) : (
    <KickIcon size={size} />
  );
}
