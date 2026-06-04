// Public API
export { FormRender } from "./components/FormRender";
export type { FormRenderProps } from "./components/FormRender";
export { useFormRenderContext } from "./components/context";
export { defaultSlots } from "./components/defaultSlots";

// Compilation / utilities (advanced use)
export { compileZod } from "./compile/zod";
export { buildDefaults } from "./compile/defaults";
export { validateSchema } from "./compile/validate";
export { getSteps, allFields } from "./compile/schema-utils";

// Engine primitives (for building custom adapters)
export { evaluateVisibility, evaluateCondition, extractDeps, isEmpty } from "./engine/condition";
export { coerceByType } from "./engine/coerce";
export { defaultTranslate } from "./engine/i18n";

// Types
export type * from "./types";
