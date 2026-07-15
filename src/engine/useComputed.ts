import { useEffect, useMemo, useRef } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import type { Field, FormValues, FormulaMap } from "../types";
import { evaluateVisibility, isEmpty, rebasePath, rebaseVisibility } from "./condition";

/**
 * Derive a computed field's value: runs the injected formula on mount (initial
 * derivation) and whenever an input changes, writing the result back without
 * dirtying the form. Each rendered field instance derives its own value, so
 * per-row computed fields inside arrays work naturally — `namePrefix` rebases
 * bare input names onto the row and `$.` escapes to the root.
 */
export function useComputedField(
  field: Field,
  formulas: FormulaMap,
  name: string,
  namePrefix?: string,
): void {
  const { control, setValue, getValues } = useFormContext();
  const spec = field.computed;

  const inputNames = useMemo(
    () => (spec?.inputs ?? []).map((i) => rebasePath(i, namePrefix)),
    [spec, namePrefix],
  );
  const watched = useWatch({ control, name: inputNames.length ? inputNames : ["__never__"] });
  const firstRun = useRef(true);

  useEffect(() => {
    const isFirst = firstRun.current;
    firstRun.current = false;
    if (!spec) return;
    const fn = formulas[spec.formula];
    if (!fn) return; // formula not injected — leave the value alone
    // editable computed fields may carry a manual override (restored from a
    // draft or edit-mode prefill) — don't clobber it with the mount derivation;
    // an actual input change afterwards still recomputes as documented.
    if (isFirst && field.editable && !isEmpty(getValues(name))) return;
    const inputs: Record<string, unknown> = {};
    // keyed by the *authored* names so the formula reads them as written
    spec.inputs.forEach((orig, i) => (inputs[orig] = (watched as unknown[])[i]));
    const next = fn(inputs);
    if (!Object.is(next, getValues(name))) {
      setValue(name, next, { shouldDirty: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watched, spec, formulas, name]);
}

/**
 * Fire a field's declarative `effects`: when this field's value changes (never
 * on mount) each effect whose `when` holds writes its static `set` values.
 * Targets/conditions rebase like everything else (bare = row sibling, `$.` = root).
 */
export function useFieldEffects(field: Field, name: string, namePrefix?: string): void {
  const { control, setValue, getValues } = useFormContext();
  const effects = field.effects;
  const value = useWatch({ control, name: effects?.length ? name : "__never__" });
  const mounted = useRef(false);

  useEffect(() => {
    if (!effects?.length) return;
    if (!mounted.current) {
      mounted.current = true; // effects react to changes, not to mounting
      return;
    }
    const vals = getValues() as FormValues;
    for (const e of effects) {
      if (!evaluateVisibility(rebaseVisibility(e.when, namePrefix), vals)) continue;
      for (const [target, v] of Object.entries(e.set)) {
        const targetName = rebasePath(target, namePrefix);
        if (!Object.is(getValues(targetName), v)) {
          setValue(targetName, v, { shouldDirty: true });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
}
