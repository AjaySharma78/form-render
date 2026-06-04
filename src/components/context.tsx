import { createContext, useContext } from "react";
import type {
  ComponentMap,
  FieldClassNames,
  FormSlots,
  LoaderMap,
  ResolverMap,
  TranslateFn,
} from "../types";

export interface FormRenderContextValue {
  components: ComponentMap;
  resolvers: ResolverMap;
  loaders: LoaderMap;
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
