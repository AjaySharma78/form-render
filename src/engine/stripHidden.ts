import type { Field, FormValues } from "../types";
import { isActionField } from "../compile/schema-utils";
import { evaluateVisibility, rebaseVisibility } from "./condition";

/**
 * Remove hidden fields' values from a submit payload. Used when
 * settings.hiddenValues is "keep": values stay in form state across
 * hide/show, but a hidden field must still not reach onSubmit.
 * Non-mutating — returns cloned containers along the walked paths.
 */
export function stripHiddenValues(fields: readonly Field[], values: FormValues): FormValues {
  const walk = (
    fs: readonly Field[],
    prefix: string | undefined,
    container: Record<string, unknown>,
  ): Record<string, unknown> => {
    const out = { ...container };
    for (const f of fs) {
      if (isActionField(f)) continue;
      const path = prefix ? `${prefix}.${f.name}` : f.name;
      // visibility is evaluated against the FULL values (conditions may
      // reference fields outside this container)
      if (!evaluateVisibility(rebaseVisibility(f.visibleWhen, prefix), values)) {
        delete out[f.name];
        continue;
      }
      if (f.type === "array" && f.item && Array.isArray(out[f.name])) {
        out[f.name] = (out[f.name] as unknown[]).map((row, i) =>
          row !== null && typeof row === "object"
            ? walk(f.item!.fields, `${path}.${i}`, row as Record<string, unknown>)
            : row,
        );
      }
    }
    return out;
  };
  return walk(fields, undefined, values);
}
