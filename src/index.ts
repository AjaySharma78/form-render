// Public API
export { FormRender } from "./components/FormRender";
export type { FormRenderProps } from "./components/FormRender";
export { defineSchema } from "./infer";
export type { InferValues } from "./infer";
export { useFormRenderContext } from "./components/context";
export { defaultSlots } from "./components/defaultSlots";

// Compilation / utilities (advanced use)
export { compileZod } from "./compile/zod";
export { buildDefaults, emptyRowFor } from "./compile/defaults";
export { validateSchema } from "./compile/validate";
export { getSteps, allFields } from "./compile/schema-utils";
export { diffSchemas } from "./engine/diff";
export type { DiffFinding, DiffOptions, DiffReport, DiffSeverity } from "./engine/diff";

// Engine primitives (for building custom adapters)
export {
  evaluateVisibility,
  evaluateCondition,
  extractDeps,
  isEmpty,
  rebasePath,
  rebaseVisibility,
} from "./engine/condition";
export { getPath, setPath } from "./engine/path";
export { fileKey } from "./engine/uploads";
export { applyMask, stripMask } from "./engine/mask";
export { coerceByType } from "./engine/coerce";
export { defaultTranslate } from "./engine/i18n";

// Types
export type * from "./types";
