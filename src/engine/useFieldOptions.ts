import { useEffect, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import type { Field, LoaderMap, OptionsState } from "../types";
import { isArrayValued } from "../compile/schema-utils";

/**
 * Resolve a field's options with loading/error state. Static `options` pass
 * through untouched; `optionsSource` loads via an injected loader, re-runs
 * (with the previous request aborted) when `dependsOn` fields change, and
 * resets the field's own value when its parents change so a stale child value
 * never lingers.
 */
export function useFieldOptions(
  field: Field,
  loaders: LoaderMap,
  /** full value path — differs from field.name inside array rows (dependsOn stays root-relative) */
  name: string = field.name,
): OptionsState {
  const { control, setValue } = useFormContext();
  const source = field.optionsSource;
  const deps = source?.dependsOn ?? [];

  const watched = useWatch({ control, name: deps.length ? [...deps] : ["__never__"] });
  const [state, setState] = useState<OptionsState>({
    options: field.options ?? [],
    loading: !!source,
  });
  const firstRun = useRef(true);

  useEffect(() => {
    if (!source) return;
    const loader = loaders[source.loader];
    if (!loader) {
      // loader not injected: don't leave the field stuck in a disabled
      // "Loading…" state — degrade to an empty, usable control (v1 behavior)
      setState({ options: [], loading: false, error: `Loader "${source.loader}" is not injected.` });
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[form-render] Field "${name}" declares optionsSource.loader "${source.loader}" but no such loader was passed to <FormRender loaders={...}>.`,
        );
      }
      return;
    }

    const depValues: Record<string, unknown> = {};
    deps.forEach((depName, i) => {
      depValues[depName] = (watched as unknown[])[i];
    });

    const ctrl = new AbortController();
    setState((s) => ({ options: s.options, loading: true }));
    loader(depValues, ctrl.signal).then(
      (opts) => {
        if (!ctrl.signal.aborted) setState({ options: opts, loading: false });
      },
      (err: unknown) => {
        if (ctrl.signal.aborted) return;
        const message = err instanceof Error ? err.message : String(err);
        setState((s) => ({ options: s.options, loading: false, error: message }));
      },
    );

    // reset child value when a parent changes (but not on initial mount).
    // No shouldValidate: validating the just-emptied child would flag a
    // required field as invalid before the user ever touches it.
    if (!firstRun.current && deps.length) {
      setValue(name, isArrayValued(field) ? [] : "", { shouldDirty: true });
    }
    firstRun.current = false;

    return () => ctrl.abort();
    // re-run when any watched dep value changes (constant length per field)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, watched as unknown[]);

  return source ? state : { options: field.options ?? [], loading: false };
}
