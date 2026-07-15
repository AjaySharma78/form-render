/**
 * Dot-path value access. Field names are path *segments* (no dots); nesting is
 * introduced by container fields (arrays/groups), whose children address values
 * as "contacts.0.name".
 *
 * The engine evaluates conditions against two shapes of object:
 *  1. the full (possibly nested) form values, and
 *  2. synthetic objects built from scoped useWatch subscriptions, keyed by the
 *     *literal* dep string (which may itself contain dots).
 * getPath therefore checks for a literal key first, then walks the path.
 */

export function getPath(values: Record<string, unknown> | undefined | null, path: string): unknown {
  if (values == null) return undefined;
  if (path in values) return values[path];
  if (!path.includes(".")) return undefined;
  let cur: unknown = values;
  for (const seg of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/**
 * Set a (possibly nested) path, creating intermediate objects — or arrays when
 * the next segment is a numeric index — as needed. Mutates `target`.
 */
export function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segs = path.split(".");
  let cur: Record<string, unknown> = target;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i]!;
    const existing = cur[seg];
    if (existing === null || typeof existing !== "object") {
      cur[seg] = /^\d+$/.test(segs[i + 1]!) ? [] : {};
    }
    cur = cur[seg] as Record<string, unknown>;
  }
  cur[segs[segs.length - 1]!] = value;
}
