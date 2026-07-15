/**
 * Async validation engine (v2).
 *
 * V1 ran async validators on blur and wrote results with raw setError — which
 * the Zod resolver wiped on every sync re-validate, and nothing re-checked at
 * submit. V2 keeps a per-field registry of async results:
 *
 *  - blur still triggers a debounced, abortable run (useAsyncValidator);
 *  - the FormRender resolver re-applies registered failures after every sync
 *    pass, as long as the failing value is unchanged (editing clears them);
 *  - handleSubmit calls ensureAsyncValid first, which re-runs stale/unrun
 *    validators for visible fields and blocks submit on any failure;
 *  - `validating` is exposed to field components/wrappers and gates submit.
 */
import { useCallback, useEffect, useRef } from "react";
import { useFormContext } from "react-hook-form";
import type { Field, FormValues, ResolverMap, TranslateFn } from "../types";
import { evaluateVisibility, rebaseVisibility } from "./condition";
import { getPath, setPath } from "./path";

const FAILED_KEY = "Validation check failed.";
const identity: TranslateFn = (k) => k;

export interface AsyncFieldState {
  status: "validating" | "valid" | "invalid";
  /** error message when invalid */
  message?: string;
  /** the value this result was produced for (staleness check) */
  value?: unknown;
}

export interface AsyncRegistry {
  get(name: string): AsyncFieldState | undefined;
  set(name: string, state: AsyncFieldState | undefined): void;
  entries(): IterableIterator<[string, AsyncFieldState]>;
  anyValidating(): boolean;
  subscribe(listener: () => void): () => void;
}

export function createAsyncRegistry(): AsyncRegistry {
  const map = new Map<string, AsyncFieldState>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  return {
    get: (name) => map.get(name),
    set(name, state) {
      if (state === undefined) map.delete(name);
      else map.set(name, state);
      notify();
    },
    entries: () => map.entries(),
    anyValidating() {
      for (const s of map.values()) if (s.status === "validating") return true;
      return false;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Returns a debounced, abortable validator to run on blur for a field that
 * declares `asyncValidation`. Results land in the registry (which the resolver
 * re-applies) AND as an immediate setError/clearErrors for instant feedback.
 */
export function useAsyncValidator(
  field: Field,
  resolvers: ResolverMap,
  registry: AsyncRegistry,
  /** full value path — differs from field.name inside array rows */
  name: string = field.name,
  t: TranslateFn = identity,
): () => void {
  const { setError, clearErrors, getValues, getFieldState } = useFormContext();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const controller = useRef<AbortController>();

  const spec = field.asyncValidation;
  const fn = spec ? resolvers[spec.resolver] : undefined;

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      controller.current?.abort();
    },
    [],
  );

  return useCallback(() => {
    if (!spec || !fn) return;
    clearTimeout(timer.current);
    controller.current?.abort();

    timer.current = setTimeout(async () => {
      const ctrl = new AbortController();
      controller.current = ctrl;
      const value = getValues(name);
      registry.set(name, { status: "validating", value });
      try {
        const message = await fn(value, ctrl.signal);
        if (ctrl.signal.aborted) return;
        if (message) {
          registry.set(name, { status: "invalid", message, value });
          setError(name, { type: "async", message });
        } else {
          registry.set(name, { status: "valid", value });
          if (getFieldState(name).error?.type === "async") {
            // only clear OUR async error — never wipe a sync (pattern/required) error
            clearErrors(name);
          }
        }
      } catch {
        if (!ctrl.signal.aborted) {
          // network/resolver failure: surface generically, don't crash the form
          const message = t(FAILED_KEY);
          registry.set(name, { status: "invalid", message, value });
          setError(name, { type: "async", message });
        }
      }
    }, spec.debounceMs ?? 400);
  }, [spec, fn, name, registry, t, getValues, setError, clearErrors, getFieldState]);
}

/** Visible fields with asyncValidation, as [field, absolute path] — recurses array rows. */
function collectAsyncTargets(
  fields: readonly Field[],
  prefix: string | undefined,
  vals: FormValues,
): Array<{ field: Field; path: string }> {
  const out: Array<{ field: Field; path: string }> = [];
  for (const f of fields) {
    if (!evaluateVisibility(rebaseVisibility(f.visibleWhen, prefix), vals)) continue;
    const path = prefix ? `${prefix}.${f.name}` : f.name;
    if (f.asyncValidation) out.push({ field: f, path });
    if (f.type === "array" && f.item) {
      const rows = getPath(vals, path);
      if (Array.isArray(rows)) {
        rows.forEach((_, i) => out.push(...collectAsyncTargets(f.item!.fields, `${path}.${i}`, vals)));
      }
    }
  }
  return out;
}

/**
 * Submit gate: re-run any async validator whose cached result is missing or
 * stale (value changed since it ran), await everything, and surface failures
 * as field errors. Returns true when every visible async field is valid.
 */
export async function ensureAsyncValid(
  fields: readonly Field[],
  values: FormValues,
  resolvers: ResolverMap,
  registry: AsyncRegistry,
  setError: (name: string, error: { type: string; message: string }) => void,
  t: TranslateFn = identity,
): Promise<boolean> {
  const targets = collectAsyncTargets(fields, undefined, values);
  const failures: Array<{ path: string; message: string }> = [];
  const runs: Promise<void>[] = [];

  for (const { field, path } of targets) {
    const fn = resolvers[field.asyncValidation!.resolver];
    if (!fn) continue;
    const value = getPath(values, path);
    const cached = registry.get(path);

    if (cached && Object.is(cached.value, value) && cached.status !== "validating") {
      if (cached.status === "invalid")
        failures.push({ path, message: cached.message ?? t(FAILED_KEY) });
      continue; // fresh result — no need to re-run
    }

    registry.set(path, { status: "validating", value });
    runs.push(
      (async () => {
        try {
          const message = await fn(value, new AbortController().signal);
          if (message) {
            registry.set(path, { status: "invalid", message, value });
            failures.push({ path, message });
          } else {
            registry.set(path, { status: "valid", value });
          }
        } catch {
          const message = t(FAILED_KEY);
          registry.set(path, { status: "invalid", message, value });
          failures.push({ path, message });
        }
      })(),
    );
  }

  await Promise.all(runs);
  for (const f of failures) setError(f.path, { type: "async", message: f.message });
  return failures.length === 0;
}

/**
 * Re-apply registered async failures to a resolver result, so a sync
 * re-validate can't wipe them. Only failures whose value is unchanged are
 * re-applied (typing a new value clears the error until the next check), and
 * a sync error at the same path wins.
 */
export function mergeAsyncErrors(
  result: { values: unknown; errors: Record<string, unknown> },
  values: FormValues,
  registry: AsyncRegistry,
): { values: unknown; errors: Record<string, unknown> } {
  let merged: Record<string, unknown> | null = null;
  for (const [name, state] of registry.entries()) {
    if (state.status !== "invalid") continue;
    if (!Object.is(getPath(values, name), state.value)) continue; // stale → let it clear
    if (getPath(result.errors, name)) continue; // sync error wins
    merged = merged ?? { ...result.errors };
    // RHF's nested errors object has the same dotted-path shape as form values
    setPath(merged, name, { type: "async", message: state.message ?? "Invalid." });
  }
  if (!merged) return result;
  return { values: {}, errors: merged };
}
