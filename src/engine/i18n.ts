import type { TranslateFn } from "../types";

/**
 * Default translator: returns the key as-is, with optional {var} interpolation.
 * Consumers pass their own `t` (e.g. wrapping i18next) to <FormRender>.
 */
export const defaultTranslate: TranslateFn = (key, vars) => {
  if (!vars) return key;
  return key.replace(/\{(\w+)\}/g, (_, name) =>
    name in vars ? String(vars[name]) : `{${name}}`,
  );
};
