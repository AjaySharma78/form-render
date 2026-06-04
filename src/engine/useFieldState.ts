import { useEffect, useMemo, useRef } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import type { Field, FormValues } from "../types";
import { evaluateCondition, evaluateVisibility, extractDeps } from "./condition";

export interface FieldState {
  visible: boolean;
  disabled: boolean;
}

/**
 * Resolve a field's conditional state (visibleWhen / requiredWhen-driven /
 * disabledWhen). Subscribes only to the fields its conditions depend on
 * (scoped useWatch) so typing in unrelated fields doesn't re-render it.
 * When a field becomes hidden its value is unregistered so it leaves the payload.
 */
export function useFieldState(field: Field): FieldState {
  const { control, unregister } = useFormContext();

  const deps = useMemo(
    () =>
      Array.from(
        new Set([
          ...extractDeps(field.visibleWhen),
          ...extractDeps(field.disabledWhen),
        ]),
      ),
    [field.visibleWhen, field.disabledWhen],
  );

  // useWatch with an empty name list watches nothing and never re-renders.
  const watched = useWatch({ control, name: deps.length ? deps : ["__never__"] });
  const values: FormValues = useMemo(() => {
    const v: FormValues = {};
    deps.forEach((name, i) => {
      v[name] = (watched as unknown[])[i];
    });
    return v;
  }, [deps, watched]);

  const visible = evaluateVisibility(field.visibleWhen, values);
  const disabled =
    !!field.disabled || (field.disabledWhen ? evaluateCondition(field.disabledWhen, values) : false);

  const wasVisible = useRef(visible);
  useEffect(() => {
    if (wasVisible.current && !visible) unregister(field.name, { keepDefaultValue: true });
    wasVisible.current = visible;
  }, [visible, field.name, unregister]);

  return { visible, disabled };
}
