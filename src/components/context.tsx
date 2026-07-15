import { createContext, useContext } from "react";
import type { AsyncRegistry } from "../engine/async";
import type { UploadRegistry } from "../engine/uploads";
import type {
  ComponentMap,
  FieldClassNames,
  FormSlots,
  FormulaMap,
  LoaderMap,
  ResolverMap,
  TranslateFn,
  UploaderMap,
} from "../types";

export interface FormRenderContextValue {
  components: ComponentMap;
  resolvers: ResolverMap;
  loaders: LoaderMap;
  formulas: FormulaMap;
  uploaders: UploaderMap;
  /** per-field async validation state (blur + submit-gate runs) */
  asyncRegistry: AsyncRegistry;
  /** per-file upload progress (file fields with `upload`) */
  uploadRegistry: UploadRegistry;
  /** grid columns from settings.columns (default 12) */
  columns: number;
  /** settings.hiddenValues (default "clear") */
  hiddenValues: "clear" | "keep";
  t: TranslateFn;
  /** resolved UI slots (defaults merged with consumer overrides) */
  slots: FormSlots;
  /** form-wide className defaults, overridable per field */
  classNames?: FieldClassNames;
}

const FormRenderContext = createContext<FormRenderContextValue | null>(null);

export const FormRenderProvider = FormRenderContext.Provider;

export function useFormRenderContext(): FormRenderContextValue {
  const ctx = useContext(FormRenderContext);
  if (!ctx) throw new Error("[form-render] components must be used inside <FormRender>.");
  return ctx;
}
