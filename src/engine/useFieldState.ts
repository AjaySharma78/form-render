import { useEffect, useMemo, useRef } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import type { Field, FormValues } from "../types";
import { evaluateVisibility, extractDeps, rebaseVisibility } from "./condition";

export interface FieldState {
  visible: boolean;
  disabled: boolean;
}

/**
 * Resolve a field's conditional state (visibleWhen / requiredWhen-driven /
 * disabledWhen). Subscribes only to the fields its conditions depend on
 * (scoped useWatch) so typing in unrelated fields doesn't re-render it.
 * When a field becomes hidden its value is unregistered so it leaves the payload.
 *
 * `namePrefix` (array rows): conditions are rebased so bare refs address row
 * siblings and `$.` refs address the form root; the value path becomes
 * `${namePrefix}.${field.name}`.
 *
 * `keepHidden` (settings.hiddenValues = "keep"): skip unregistering so the
 * user's value survives hide/show round-trips; the submit path strips hidden
 * values from the payload instead.
 */
export function useFieldState(field: Field, namePrefix?: string, keepHidden = false): FieldState {
  const { control, unregister } = useFormContext();
  const name = namePrefix ? `${namePrefix}.${field.name}` : field.name;

  const { visibleWhen, disabledWhen } = useMemo(
    () => ({
      visibleWhen: rebaseVisibility(field.visibleWhen, namePrefix),
      disabledWhen: rebaseVisibility(field.disabledWhen, namePrefix),
    }),
    [field.visibleWhen, field.disabledWhen, namePrefix],
  );

  const deps = useMemo(
    () => Array.from(new Set([...extractDeps(visibleWhen), ...extractDeps(disabledWhen)])),
    [visibleWhen, disabledWhen],
  );

  // useWatch with an empty name list watches nothing and never re-renders.
  const watched = useWatch({ control, name: deps.length ? deps : ["__never__"] });
  const values: FormValues = useMemo(() => {
    const v: FormValues = {};
    deps.forEach((depName, i) => {
      v[depName] = (watched as unknown[])[i];
    });
    return v;
  }, [deps, watched]);

  const visible = evaluateVisibility(visibleWhen, values);
  const disabled =
    !!field.disabled || (disabledWhen ? evaluateVisibility(disabledWhen, values) : false);

  const wasVisible = useRef(visible);
  useEffect(() => {
    if (wasVisible.current && !visible && !keepHidden)
      unregister(name, { keepDefaultValue: true });
    wasVisible.current = visible;
  }, [visible, name, unregister, keepHidden]);

  return { visible, disabled };
}
