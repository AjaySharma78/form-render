/** Minimal className joiner (filters falsy). The shadcn template uses the
 * consumer's own `cn` (clsx + tailwind-merge) for conflict-aware merging. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Map a field `width` to a grid span (default 12-column base; settings.columns overrides). */
export function widthToSpan(width: unknown, columns = 12): number {
  if (typeof width === "number") return Math.min(columns, Math.max(1, width));
  switch (width) {
    case "half":
      return Math.max(1, Math.round(columns / 2));
    case "third":
      return Math.max(1, Math.round(columns / 3));
    case "full":
    default:
      return columns;
  }
}
