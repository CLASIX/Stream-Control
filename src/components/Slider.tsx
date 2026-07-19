import { useCallback, useEffect, useRef } from "react";

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Accent colour for the filled track + thumb. */
  color?: string;
  /** Disable interaction. */
  disabled?: boolean;
  "aria-label"?: string;
}

/**
 * Fully custom slider (no native `<input type=range>`).
 *
 * - Pointer-driven track with a gradient fill and a glowing thumb.
 * - Click anywhere on the track to jump; drag the thumb to fine-tune.
 * - Keyboard accessible (arrows / home / end) when focused.
 */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  color = "#9146FF",
  disabled = false,
  "aria-label": ariaLabel,
}: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const clamped = Math.max(0, Math.min(100, pct));

  const valueFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return value;
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const raw = min + ratio * (max - min);
      const snapped = Math.round(raw / step) * step;
      // Fix floating point drift from step rounding.
      const decimals = (String(step).split(".")[1] || "").length;
      return Number(Math.max(min, Math.min(max, snapped)).toFixed(decimals));
    },
    [min, max, step, value]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    onChange(valueFromClientX(e.clientX));
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || disabled) return;
    onChange(valueFromClientX(e.clientX));
  };

  const stopDragging = () => {
    dragging.current = false;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    let next = value;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = value + step;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = value - step;
    else if (e.key === "Home") next = min;
    else if (e.key === "End") next = max;
    else return;
    e.preventDefault();
    const decimals = (String(step).split(".")[1] || "").length;
    onChange(Number(Math.max(min, Math.min(max, next)).toFixed(decimals)));
  };

  // Release capture if unmounted mid-drag.
  useEffect(() => stopDragging, []);

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={ariaLabel}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      onKeyDown={handleKeyDown}
      className={`group relative h-6 flex items-center select-none touch-none outline-none ${
        disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
      }`}
    >
      {/* Track */}
      <div className="relative h-1.5 w-full rounded-full bg-white/12">
        {/* Fill */}
        <div
          className="absolute left-0 top-0 h-full rounded-full"
          style={{
            width: `${clamped}%`,
            background: color,
            boxShadow: `0 0 8px ${color}66`,
          }}
        />
        {/* Thumb */}
        <div
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-md transition-transform group-focus:ring-2 group-focus:ring-white/50"
          style={{
            left: `${clamped}%`,
            boxShadow: `0 0 0 3px ${color}55, 0 2px 6px rgba(0,0,0,0.5)`,
          }}
        />
      </div>
    </div>
  );
}
