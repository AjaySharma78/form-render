import { useEffect, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import type { Field, FieldOption, LoaderMap } from "../types";
import { isArrayValued } from "../compile/schema-utils";

/**
 * Resolve a field's options: static `options` pass through; `optionsSource`
 * loads via an injected loader, re-runs when `dependsOn` fields change, and
 * resets the field's own value when its parents change (so a stale child value
 * never lingers).
 */
export function useFieldOptions(field: Field, loaders: LoaderMap): FieldOption[] {
  const { control, setValue } = useFormContext();
  const source = field.optionsSource;
  const deps = source?.dependsOn ?? [];

  const watched = useWatch({ control, name: deps.length ? deps : ["__never__"] });
  const [options, setOptions] = useState<FieldOption[]>(field.options ?? []);
  const firstRun = useRef(true);

  useEffect(() => {
    if (!source) return;
    const loader = loaders[source.loader];
    if (!loader) return;

    const depValues: Record<string, unknown> = {};
    deps.forEach((name, i) => {
      depValues[name] = (watched as unknown[])[i];
    });

    let cancelled = false;
    loader(depValues).then((opts) => {
      if (!cancelled) setOptions(opts);
    });

    // reset child value when a parent changes (but not on initial mount)
    if (!firstRun.current && deps.length) {
      setValue(field.name, isArrayValued(field) ? [] : "");
    }
    firstRun.current = false;

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(watched)]);

  return source ? options : field.options ?? [];
}
