import { useCallback, useEffect, useRef } from "react";
import { useFormContext } from "react-hook-form";
import type { Field, ResolverMap } from "../types";

/**
 * Returns a debounced, abortable validator to run on blur for a field that
 * declares `asyncValidation`. Stale requests are cancelled; the result is
 * written back via RHF setError/clearErrors. No-op if the field has no async
 * rule or its resolver isn't provided.
 */
export function useAsyncValidator(field: Field, resolvers: ResolverMap): () => void {
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
      try {
        const message = await fn(getValues(field.name), ctrl.signal);
        if (ctrl.signal.aborted) return;
        if (message) {
          setError(field.name, { type: "async", message });
        } else if (getFieldState(field.name).error?.type === "async") {
          // only clear OUR async error — never wipe a sync (pattern/required) error
          clearErrors(field.name);
        }
      } catch {
        if (!ctrl.signal.aborted) {
          // network/resolver failure: surface generically, don't crash the form
          setError(field.name, { type: "async", message: "Validation check failed." });
        }
      }
    }, spec.debounceMs ?? 400);
  }, [spec, fn, field.name, getValues, setError, clearErrors, getFieldState]);
}
