import { useState, useRef, KeyboardEvent } from "react";

interface StarRatingProps {
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
  label?: string;
}

export function StarRating({
  value,
  onChange,
  disabled = false,
  label = "Rate this recommendation",
}: StarRatingProps) {
  const [hovered, setHovered] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  function handleKey(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(5, index + 1);
      containerRef.current
        ?.querySelectorAll<HTMLButtonElement>("button")
        [next - 1]?.focus();
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      const prev = Math.max(1, index - 1);
      containerRef.current
        ?.querySelectorAll<HTMLButtonElement>("button")
        [prev - 1]?.focus();
    }
  }

  const display = hovered || value;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-fg-muted">{label}</span>
      <div
        ref={containerRef}
        className="flex gap-1"
        role="group"
        aria-label={label}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            aria-label={`Rate ${star} star${star !== 1 ? "s" : ""}`}
            aria-pressed={value === star}
            disabled={disabled}
            onClick={() => onChange(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            onKeyDown={(e) => handleKey(e, star)}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded transition-colors
              focus:outline-none focus-visible:ring-2 focus-visible:ring-ring
              disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              viewBox="0 0 20 20"
              fill={star <= display ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={1.5}
              className={`w-6 h-6 transition-colors ${
                star <= display ? "text-yellow-400" : "text-fg-muted"
              }`}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
              />
            </svg>
          </button>
        ))}
        {value > 0 && (
          <span className="self-center text-xs text-fg-muted ml-1">
            {value}/5
          </span>
        )}
      </div>
    </div>
  );
}
