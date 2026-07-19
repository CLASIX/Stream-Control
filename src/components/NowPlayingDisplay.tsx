import { useRef, useEffect, useState, type CSSProperties } from "react";
import type { SpotifyTrack } from "../lib/spotify";
import { Turntable } from "./Turntable";

interface Props {
  track: SpotifyTrack | null;
  preview?: boolean;
}

/**
 * Still when text fits the parent width; seamless marquee when it overflows.
 * Parent must constrain width (flex-1 + min-w-0, or an explicit width).
 */
function MarqueeText({
  text,
  style,
  className,
  isPlaying,
}: {
  text: string;
  style?: CSSProperties;
  className?: string;
  isPlaying?: boolean;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [contentWidth, setContentWidth] = useState(0);

  useEffect(() => {
    const outer = outerRef.current;
    const measure = measureRef.current;
    if (!outer || !measure) return;

    const check = () => {
      requestAnimationFrame(() => {
        if (!outer || !measure) return;
        const natural = measure.scrollWidth;
        const available = outer.clientWidth;
        // Only marquee when the parent is actually constraining us
        // (available > 0 and natural text is wider)
        const isOver = available > 0 && natural > available + 1;
        setOverflow(isOver);
        if (isOver) setContentWidth(natural);
      });
    };

    check();
    const ro = new ResizeObserver(check);
    ro.observe(outer);
    ro.observe(measure);
    return () => ro.disconnect();
  }, [text, style?.fontSize]);

  const measureSpan = (
    <span
      ref={measureRef}
      aria-hidden="true"
      className="absolute whitespace-nowrap pointer-events-none"
      style={{
        visibility: "hidden",
        left: 0,
        top: 0,
        fontSize: style?.fontSize,
        fontFamily: style?.fontFamily,
        fontWeight: style?.fontWeight as CSSProperties["fontWeight"],
        letterSpacing: style?.letterSpacing,
        lineHeight: style?.lineHeight,
      }}
    >
      {text}
    </span>
  );

  const gap = 48;
  const duration = Math.max(6, (contentWidth + gap) / 40);

  return (
    <div
      ref={outerRef}
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        width: "100%",
        minWidth: 0,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {measureSpan}
      {overflow ? (
        <div
          style={{
            display: "inline-flex",
            whiteSpace: "nowrap",
            willChange: "transform",
            animation: `marquee ${duration}s linear infinite`,
            animationPlayState: isPlaying ? "running" : "paused",
          }}
        >
          <span className="inline-block" style={{ paddingRight: gap }}>
            {text}
          </span>
          <span
            className="inline-block"
            style={{ paddingRight: gap }}
            aria-hidden="true"
          >
            {text}
          </span>
        </div>
      ) : (
        <span className="inline-block whitespace-nowrap">{text}</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Design-space dimensions (~25% smaller than the previous 460×90).
 * Scale factor = min(cardW/DW, cardH/DH) so every pixel value stays crisp.
 */
const DW = 345;
const DH = 68;
const SLEEVE_W = 100; // cover 72 + vinyl peek room
const PAD_X = 16;
const GAP = 10;

export function NowPlayingDisplay({ track, preview = false }: Props) {
  const isPlaying = Boolean(track && track.isPlaying);
  const albumArt = track?.albumArt ?? "";
  // Outer shell measures the Browser Source / preview box
  const shellRef = useRef<HTMLDivElement>(null);
  // Card itself is sized from shell (one fixed proportion of the source)
  const cardRef = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(DW);
  const [ch, setCh] = useState(DH);

  const title = track?.name || "Waiting for track...";
  const artist = track?.artist || "Start playing on Spotify";

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const update = () => {
      setCw(el.clientWidth || DW);
      setCh(el.clientHeight || DH);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const s = Math.min(cw / DW, ch / DH) || 1;
  const sw = (v: number) => v * s;

  // Fixed text-column width at current scale (always the same — box is one size)
  const textColW = Math.max(40, sw(DW - PAD_X * 2 - SLEEVE_W - GAP));

  const cardBg = preview
    ? "rounded-2xl border border-white/10 bg-[#101311]"
    : "rounded-2xl border border-white/10 bg-[rgba(8,10,9,0.85)]";

  return (
    // Transparent shell fills the Browser Source so OBS can keep any size;
    // the visible card is ~25% smaller and centered inside it.
    <div
      ref={shellRef}
      className="relative flex items-center justify-center overflow-hidden"
      style={{ width: "100%", height: "100%" }}
    >
    <div
      ref={cardRef}
      className={`relative flex items-center overflow-hidden ${cardBg}`}
      style={{
        width: preview ? "100%" : "75%",
        height: preview ? "100%" : "75%",
        padding: `${sw(12)}px ${sw(PAD_X)}px`,
        gap: `${sw(GAP)}px`,
        boxShadow: `0 ${sw(12)}px ${sw(32)}px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
        justifyContent: "center",
      }}
    >
      {/* Background album-art glow */}
      {albumArt && (
        <div
          className="pointer-events-none absolute opacity-[0.14]"
          style={{
            inset: `${-sw(40)}px`,
            backgroundImage: `url(${albumArt})`,
            backgroundPosition: "center",
            backgroundSize: "cover",
            filter: `blur(${sw(40)}px)`,
          }}
        />
      )}

      {/* Album Sleeve & Peeking Vinyl */}
      <div
        className="relative z-10 flex items-center shrink-0"
        style={{
          height: "100%",
          width: `${sw(SLEEVE_W)}px`,
        }}
      >
        <div
          className="absolute transition-transform duration-700"
          style={{
            left: `${sw(30)}px`,
            top: "50%",
            transform: `translateY(-50%) ${
              isPlaying ? "" : `translateX(${-sw(15)}px)`
            }`,
          }}
        >
          <Turntable track={track} size={sw(70)} />
        </div>

        <div
          className="relative rounded-lg bg-neutral-900 overflow-hidden border border-white/10"
          style={{
            height: `${sw(72)}px`,
            width: `${sw(72)}px`,
            boxShadow: `${sw(4)}px 0 ${sw(12)}px rgba(0,0,0,0.5)`,
          }}
        >
          {albumArt ? (
            <img
              src={albumArt}
              alt={track?.album ?? ""}
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div
              className="h-full w-full flex items-center justify-center bg-gradient-to-br from-[#1DB954] to-[#0d5922] text-white font-extrabold"
              style={{ fontSize: `${sw(12)}px` }}
            >
              MUSIC
            </div>
          )}
        </div>
      </div>

      {/* Typography column — fixed width so vinyl+text are always symmetric in the box */}
      <div
        className="relative z-10 flex min-w-0 flex-col justify-center overflow-hidden"
        style={{
          width: `${textColW}px`,
          paddingTop: `${sw(4)}px`,
          paddingBottom: `${sw(4)}px`,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between w-full"
          style={{ gap: `${sw(8)}px`, marginBottom: `${sw(6)}px` }}
        >
          <span
            className="font-black text-white/40 uppercase shrink-0"
            style={{ fontSize: `${sw(9)}px`, letterSpacing: "0.24em" }}
          >
            NOW PLAYING
          </span>

          {isPlaying && (
            <div
              className="flex items-end pr-1 shrink-0"
              style={{ gap: `${sw(2)}px`, height: `${sw(14)}px` }}
            >
              <span
                className="visualizer-bar-1 rounded-full bg-[#1DB954]"
                style={{
                  width: `${sw(2)}px`,
                  height: "100%",
                  boxShadow: `0 0 ${sw(6)}px #1DB954`,
                }}
              />
              <span
                className="visualizer-bar-2 rounded-full bg-[#1DB954]"
                style={{
                  width: `${sw(2)}px`,
                  height: "75%",
                  boxShadow: `0 0 ${sw(6)}px #1DB954`,
                }}
              />
              <span
                className="visualizer-bar-3 rounded-full bg-[#1DB954]"
                style={{
                  width: `${sw(2)}px`,
                  height: "100%",
                  boxShadow: `0 0 ${sw(6)}px #1DB954`,
                }}
              />
              <span
                className="visualizer-bar-4 rounded-full bg-[#1DB954]"
                style={{
                  width: `${sw(2)}px`,
                  height: "50%",
                  boxShadow: `0 0 ${sw(6)}px #1DB954`,
                }}
              />
            </div>
          )}
        </div>

        {/* Title — still if fits, marquee if too long */}
        <MarqueeText
          text={title}
          className="font-bold text-white"
          style={{
            fontSize: `${sw(15)}px`,
            lineHeight: 1.2,
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
          isPlaying={isPlaying}
        />

        {/* Artist — still if fits, marquee if too long */}
        <MarqueeText
          text={artist}
          className="font-medium text-[#1DB954]"
          style={{
            fontSize: `${sw(12.5)}px`,
            lineHeight: 1.2,
            fontFamily: "system-ui, -apple-system, sans-serif",
            marginTop: `${sw(2)}px`,
          }}
          isPlaying={isPlaying}
        />
      </div>
    </div>
    </div>
  );
}
