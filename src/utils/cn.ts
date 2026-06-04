/** Minimal className joiner (filters falsy). The shadcn template uses the
 * consumer's own `cn` (clsx + tailwind-merge) for conflict-aware merging. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Map a field `width` to a 12-column grid span. */
export function widthToSpan(width: unknown): number {
  if (typeof width === "number") return Math.min(12, Math.max(1, width));
  switch (width) {
    case "half":
      return 6;
    case "third":
      return 4;
    case "full":
    default:
      return 12;
  }
}
