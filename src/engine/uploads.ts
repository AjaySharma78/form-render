/**
 * File uploads engine. A file field with `upload: "<uploaderName>"` uploads
 * each selected File immediately through the injected uploader, tracking
 * per-file progress in a registry. At submit, resolveUploads() blocks the
 * submit while anything is in flight or failed, and swaps File values for
 * their uploaded URLs — so validation ran on Files, but the payload carries
 * strings. This institutionalizes the README's "upload on drop" recipe.
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import type { Field, FileUploadState, FormValues, TranslateFn, UploaderMap } from "../types";
import { evaluateVisibility, rebaseVisibility } from "./condition";
import { getPath } from "./path";

/** Stable identity for a File across renders. */
export const fileKey = (f: File): string => `${f.name}:${f.size}:${f.lastModified}`;

export interface UploadRegistry {
  get(key: string): FileUploadState | undefined;
  set(key: string, state: FileUploadState | undefined): void;
  snapshot(): Record<string, FileUploadState>;
  anyUploading(): boolean;
  subscribe(listener: () => void): () => void;
}

export function createUploadRegistry(): UploadRegistry {
  const map = new Map<string, FileUploadState>();
  const listeners = new Set<() => void>();
  let snapshot: Record<string, FileUploadState> = {};
  const notify = () => {
    snapshot = Object.fromEntries(map);
    listeners.forEach((l) => l());
  };
  return {
    get: (key) => map.get(key),
    set(key, state) {
      if (state === undefined) {
        if (!map.delete(key)) return; // nothing removed → no notify
      } else {
        // skip no-op writes (e.g. repeated progress ticks that round to the
        // same percent) so subscribers don't re-render for nothing
        const prev = map.get(key);
        if (
          prev &&
          prev.status === state.status &&
          prev.progress === state.progress &&
          prev.url === state.url &&
          prev.error === state.error
        )
          return;
        map.set(key, state);
      }
      notify();
    },
    snapshot: () => snapshot,
    anyUploading() {
      for (const s of map.values()) if (s.status === "uploading") return true;
      return false;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const asFiles = (value: unknown): File[] => {
  if (typeof File === "undefined") return [];
  if (value instanceof File) return [value];
  if (Array.isArray(value)) return value.filter((v): v is File => v instanceof File);
  return [];
};

/** Registry entries are scoped per field path so two fields holding an
 * identical File never share (or clobber) each other's upload state. */
const registryKey = (fieldPath: string, file: File) => `${fieldPath}::${fileKey(file)}`;

// inert subscription for fields without `upload` — they must never re-render
// on upload traffic (preserves the scoped-subscription architecture)
const noopSubscribe = () => () => {};
const EMPTY_SNAPSHOT: Record<string, FileUploadState> = {};
const emptySnapshot = () => EMPTY_SNAPSHOT;

/**
 * Drive uploads for one file field instance: newly selected files start
 * uploading; removed files are aborted (in flight) and forgotten; unmount
 * aborts everything this instance started. Returns the per-file upload state
 * keyed by fileKey(file) — or undefined when the field has no `upload`.
 */
export function useFileUploads(
  field: Field,
  name: string,
  uploaders: UploaderMap,
  registry: UploadRegistry,
): Record<string, FileUploadState> | undefined {
  const { control } = useFormContext();
  const active = field.type === "file" && !!field.upload;
  const uploader = active ? uploaders[field.upload!] : undefined;
  const value = useWatch({ control, name: active ? name : "__never__" });
  const controllers = useRef(new Map<string, AbortController>());

  useEffect(() => {
    if (!uploader) return;
    const files = asFiles(value);
    const present = new Set(files.map((f) => registryKey(name, f)));

    // removed → abort if in flight, and drop the entry (done/error included)
    // so re-adding the same file starts a fresh upload
    for (const [key, ctrl] of controllers.current) {
      if (!present.has(key)) {
        ctrl.abort();
        controllers.current.delete(key);
      }
    }
    for (const [key] of Object.entries(registry.snapshot())) {
      if (key.startsWith(`${name}::`) && !present.has(key)) registry.set(key, undefined);
    }

    // new files → start uploading
    for (const file of files) {
      const key = registryKey(name, file);
      if (registry.get(key)) continue; // already uploading/done/error
      const ctrl = new AbortController();
      controllers.current.set(key, ctrl);
      registry.set(key, { status: "uploading", progress: 0 });
      uploader(file, {
        signal: ctrl.signal,
        onProgress: (percent) => {
          if (!ctrl.signal.aborted)
            registry.set(key, {
              status: "uploading",
              // round so streams of sub-percent ticks don't trigger renders
              progress: Math.min(99, Math.round(percent)),
            });
        },
      }).then(
        (url) => {
          if (!ctrl.signal.aborted) registry.set(key, { status: "done", progress: 100, url });
          controllers.current.delete(key);
        },
        (err: unknown) => {
          if (!ctrl.signal.aborted)
            registry.set(key, {
              status: "error",
              progress: 0,
              error: err instanceof Error ? err.message : String(err),
            });
          controllers.current.delete(key);
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, uploader, name]);

  // abort in-flight uploads on unmount
  useEffect(
    () => () => {
      controllers.current.forEach((c) => c.abort());
      controllers.current.clear();
    },
    [],
  );

  // inactive fields subscribe to nothing — no re-renders on upload traffic
  const uploads = useSyncExternalStore(
    active ? registry.subscribe : noopSubscribe,
    active ? registry.snapshot : emptySnapshot,
    emptySnapshot,
  );
  return useMemo(() => {
    if (!active) return undefined;
    // narrow to this field's files, exposed under the documented fileKey(file) key
    const files = asFiles(value);
    const out: Record<string, FileUploadState> = {};
    for (const f of files) {
      const st = uploads[registryKey(name, f)];
      if (st) out[fileKey(f)] = st;
    }
    return out;
  }, [active, uploads, value, name]);
}

/** Visible file fields with `upload`, as [field, absolute path] — recurses array rows. */
function collectUploadTargets(
  fields: readonly Field[],
  prefix: string | undefined,
  vals: FormValues,
): Array<{ field: Field; path: string }> {
  const out: Array<{ field: Field; path: string }> = [];
  for (const f of fields) {
    if (!evaluateVisibility(rebaseVisibility(f.visibleWhen, prefix), vals)) continue;
    const path = prefix ? `${prefix}.${f.name}` : f.name;
    if (f.type === "file" && f.upload) out.push({ field: f, path });
    if (f.type === "array" && f.item) {
      const rows = getPath(vals, path);
      if (Array.isArray(rows)) {
        rows.forEach((_, i) =>
          out.push(...collectUploadTargets(f.item!.fields, `${path}.${i}`, vals)),
        );
      }
    }
  }
  return out;
}

/**
 * Submit gate + swap. Blocks (returns ok: false, with field errors set) while
 * any upload is in flight or failed; otherwise returns a payload where each
 * uploading file field's File(s) are replaced by their uploaded URL(s).
 * Fields whose named uploader was never injected are passed through untouched
 * (their Files reach onSubmit) — a missing injection must not brick submit.
 */
export function resolveUploads(
  fields: readonly Field[],
  values: FormValues,
  registry: UploadRegistry,
  uploaders: UploaderMap,
  setError: (name: string, error: { type: string; message: string }) => void,
  t: TranslateFn,
): { ok: boolean; payload: FormValues } {
  const targets = collectUploadTargets(fields, undefined, values);
  let ok = true;
  const payload: FormValues = { ...values };

  for (const { field, path } of targets) {
    if (!uploaders[field.upload!]) continue; // uploader not injected → plain file field
    const value = getPath(values, path);
    const files = asFiles(value);
    if (!files.length) continue;

    const states = files.map((f) => registry.get(registryKey(path, f)));
    if (states.some((s) => !s || s.status === "uploading")) {
      setError(path, { type: "upload", message: t("Please wait for uploads to finish.") });
      ok = false;
      continue;
    }
    if (states.some((s) => s!.status === "error")) {
      setError(path, { type: "upload", message: t("Some uploads failed — remove the file and retry.") });
      ok = false;
      continue;
    }
    const urls = states.map((s) => s!.url!);
    setNested(payload, path, field.multiple ? urls : urls[0]);
  }
  return { ok, payload };
}

/** Set a dotted path in the payload, cloning containers along the way (no mutation of `values`). */
function setNested(target: FormValues, path: string, value: unknown): void {
  const segs = path.split(".");
  let cur: Record<string, unknown> = target;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i]!;
    const existing = cur[seg];
    const clone = Array.isArray(existing)
      ? [...existing]
      : existing !== null && typeof existing === "object"
        ? { ...(existing as Record<string, unknown>) }
        : /^\d+$/.test(segs[i + 1]!)
          ? []
          : {};
    cur[seg] = clone;
    cur = clone as Record<string, unknown>;
  }
  cur[segs[segs.length - 1]!] = value;
}
