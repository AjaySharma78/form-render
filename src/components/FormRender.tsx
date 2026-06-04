import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { FormProvider, useForm, useFormContext, useWatch } from "react-hook-form";
import { buildDefaults } from "../compile/defaults";
import { getSteps } from "../compile/schema-utils";
import { validateSchema } from "../compile/validate";
import { compileZod } from "../compile/zod";
import { evaluateVisibility, extractDeps } from "../engine/condition";
import { defaultTranslate } from "../engine/i18n";
import type {
  ComponentMap,
  Field,
  FormSchema,
  FormSlots,
  FormValues,
  LoaderMap,
  ResolverMap,
  SubmitResult,
  TranslateFn,
} from "../types";
import { cn } from "../utils/cn";
import { FormRenderProvider, useFormRenderContext } from "./context";
import { defaultSlots } from "./defaultSlots";
import { StepBody } from "./StepBody";

export interface FormRenderProps {
  schema: FormSchema;
  components: ComponentMap;
  onSubmit: (values: FormValues) => void | SubmitResult | Promise<void | SubmitResult>;
  onReset?: () => void;
  onAction?: (action: string, values: FormValues) => void;
  resolvers?: ResolverMap;
  loaders?: LoaderMap;
  t?: TranslateFn;
  /**
   * Initial field values, read **once** on mount (React Hook Form semantics).
   * Use for create-mode prefill or when the data is already available at first
   * render. Merged over the schema's per-field defaults — partial is fine.
   */
  defaultValues?: FormValues;
  /**
   * Edit-mode prefill that **syncs after mount**. When this object changes the
   * form re-initialises to it (so async-fetched records work without remounting
   * via `key`), while keeping fields the user has already edited. Also merged
   * over the schema defaults. Leave undefined for create mode.
   */
  values?: FormValues;
  className?: string;
  /**
   * Override any UI slot (Button, FieldWrapper, Title, Stepper, Step, Section,
   * Grid, Cell, Actions). Omitted slots use the default `fr-*` markup. Pass a
   * full shadcn bundle to render the form with zero custom markup.
   */
  slots?: Partial<FormSlots>;
}

export function FormRender({
  schema,
  components,
  onSubmit,
  onReset,
  onAction,
  resolvers = {},
  loaders = {},
  t = defaultTranslate,
  defaultValues,
  values,
  className,
  slots,
}: FormRenderProps) {
  const mergedSlots = useMemo<FormSlots>(() => ({ ...defaultSlots, ...slots }), [slots]);
  // dev-time schema sanity check (duplicate names, unknown refs)
  useMemo(() => {
    if (process.env.NODE_ENV !== "production") validateSchema(schema);
  }, [schema]);

  const resolver = useMemo(() => zodResolver(compileZod(schema, t)), [schema, t]);
  const initialValues = useMemo(() => buildDefaults(schema, defaultValues), [schema, defaultValues]);
  // edit-mode: re-sync to fresh data after mount, but keep the user's edits.
  const syncedValues = useMemo(
    () => (values ? buildDefaults(schema, values) : undefined),
    [schema, values],
  );

  const form = useForm<FormValues>({
    resolver,
    defaultValues: initialValues,
    values: syncedValues,
    resetOptions: { keepDirtyValues: true },
    mode: mapMode(schema.settings?.validateOn),
    reValidateMode: "onChange",
    shouldFocusError: true,
  });

  usePersistence(schema, form);

  // stable context value so fields don't re-render on unrelated parent renders
  const contextValue = useMemo(
    () => ({ components, resolvers, loaders, t, slots: mergedSlots, classNames: schema.classNames }),
    [components, resolvers, loaders, t, mergedSlots, schema.classNames],
  );

  return (
    <FormRenderProvider value={contextValue}>
      <FormProvider {...form}>
        <FormInner
          schema={schema}
          className={className}
          onSubmit={onSubmit}
          onReset={onReset}
          onAction={onAction}
          t={t}
        />
      </FormProvider>
    </FormRenderProvider>
  );
}

function FormInner({
  schema,
  className,
  onSubmit,
  onReset,
  onAction,
  t,
}: Pick<FormRenderProps, "schema" | "className" | "onSubmit" | "onReset" | "onAction"> & {
  t: TranslateFn;
}) {
  const form = useFormContext<FormValues>();
  const { slots } = useFormRenderContext();
  const { Button, Title, Stepper, Step, Actions } = slots;

  const steps = useMemo(() => getSteps(schema), [schema]);

  // Only subscribe to the fields that step `visibleWhen` conditions depend on —
  // not the whole form — so typing in unrelated fields doesn't re-render the form.
  const stepDeps = useMemo(
    () => Array.from(new Set(steps.flatMap((s) => extractDeps(s.visibleWhen)))),
    [steps],
  );
  const watched = useWatch({ control: form.control, name: stepDeps.length ? stepDeps : ["__never__"] });
  const visibleSteps = useMemo(() => {
    const values: FormValues = {};
    stepDeps.forEach((n, i) => (values[n] = (watched as unknown[])[i]));
    return steps.filter((s) => evaluateVisibility(s.visibleWhen, values));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, stepDeps, watched]);

  const [stepIndex, setStepIndex] = useState(0);
  const clamped = Math.min(stepIndex, Math.max(0, visibleSteps.length - 1));
  const current = visibleSteps[clamped];
  const isLast = clamped === visibleSteps.length - 1;
  const isMultiStep = visibleSteps.length > 1;
  const gated = (schema.settings?.stepValidation ?? "gated") === "gated";
  const nav = schema.settings?.navigation ?? {};

  const submit = form.handleSubmit(async (values) => {
    const result = await onSubmit(values);
    if (result?.errors) {
      const entries = Object.entries(result.errors);
      entries.forEach(([name, message]) => form.setError(name, { type: "server", message }));
      if (entries[0]) form.setFocus(entries[0][0]);
    }
  });

  async function goNext() {
    if (gated) {
      const names = current?.fields.map((f) => f.name) ?? [];
      const ok = await form.trigger(names);
      if (!ok) return;
    }
    setStepIndex(clamped + 1);
  }

  function handleReset() {
    form.reset(buildDefaults(schema));
    onReset?.();
  }

  function fireAction(field: Field) {
    if (field.type === "submit") return; // handled by form submit
    if (field.type === "reset") return handleReset();
    onAction?.(field.action ?? field.name, form.getValues());
  }

  return (
    <form onSubmit={submit} noValidate className={cn("fr-form", className)}>
      {schema.title && <Title>{t(schema.title)}</Title>}

      {isMultiStep && (
        <Stepper steps={visibleSteps.map((s) => ({ id: s.id, title: t(s.title) }))} current={clamped} />
      )}

      {current && (
        <Step
          title={isMultiStep && current.title ? t(current.title) : undefined}
          description={current.description ? t(current.description) : undefined}
          disabled={form.formState.isSubmitting}
        >
          <StepBody step={current} />
        </Step>
      )}

      <Actions>
        {/* extra, author-defined buttons */}
        {(schema.actions ?? []).map((a) => (
          <Button
            key={a.name}
            type={a.type === "submit" ? "submit" : "button"}
            variant={a.type === "submit" ? "primary" : a.type === "reset" ? "outline" : "secondary"}
            disabled={form.formState.isSubmitting}
            onClick={a.type === "submit" ? undefined : () => fireAction(a)}
          >
            {a.text ? t(a.text) : a.name}
          </Button>
        ))}

        {/* auto navigation */}
        {isMultiStep && clamped > 0 && (
          <Button type="button" variant="outline" onClick={() => setStepIndex(clamped - 1)}>
            {t(nav.back ?? "Back")}
          </Button>
        )}
        {isMultiStep && !isLast ? (
          <Button type="button" variant="primary" onClick={goNext}>
            {t(nav.next ?? "Next")}
          </Button>
        ) : (
          <Button type="submit" variant="primary" disabled={form.formState.isSubmitting}>
            {t(nav.finish ?? "Submit")}
          </Button>
        )}
      </Actions>
    </form>
  );
}

function mapMode(
  validateOn: "onChange" | "onBlur" | "onSubmit" | undefined,
): "onChange" | "onSubmit" | "onTouched" {
  if (validateOn === "onChange") return "onChange";
  if (validateOn === "onSubmit") return "onSubmit";
  // "onBlur" (and default) → onTouched: validate on first blur, then clear/update
  // on every change. Pure RHF "onBlur" never re-validates on change before submit,
  // which leaves stale errors after the user fixes a field.
  return "onTouched";
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/**
 * Drop values that can't survive JSON round-tripping (File/Blob) before
 * persisting. `JSON.stringify(file)` is `{}`, so without this a persisted
 * file field would restore as empty objects (no name/size) — broken rows that
 * also can't be removed. File inputs are inherently non-persistable; the user
 * re-selects after a reload.
 *
 * Only File/Blob are stripped. We recurse into plain objects and arrays to find
 * nested ones, but return the *same reference* when nothing was removed — so on
 * the common (file-less) keystroke path there's no clone, and the rest of the
 * tree (Date, etc.) passes straight through to JSON.stringify's native handling
 * rather than being collapsed to `{}`.
 */
function persistable(value: unknown): unknown {
  if (typeof File !== "undefined" && value instanceof File) return undefined;
  if (typeof Blob !== "undefined" && value instanceof Blob) return undefined;
  if (Array.isArray(value)) {
    let changed = false;
    const out: unknown[] = [];
    for (const item of value) {
      const s = persistable(item);
      if (s === undefined) {
        changed = true; // drop the item rather than leave a JSON `null` hole
        continue;
      }
      if (s !== item) changed = true;
      out.push(s);
    }
    return changed ? out : value;
  }
  if (isPlainObject(value)) {
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const s = persistable(v);
      if (s === undefined) {
        changed = true;
        continue;
      }
      if (s !== v) changed = true;
      out[k] = s;
    }
    return changed ? out : value;
  }
  return value;
}

function usePersistence(schema: FormSchema, form: ReturnType<typeof useForm<FormValues>>) {
  const mode = schema.settings?.persist ?? "none";
  const key = `form-render:${schema.id}`;

  useEffect(() => {
    if (mode === "none" || typeof window === "undefined") return;
    const store = mode === "local" ? window.localStorage : window.sessionStorage;
    const saved = store.getItem(key);
    if (saved) {
      try {
        form.reset({ ...form.getValues(), ...JSON.parse(saved) });
      } catch {
        /* ignore corrupt drafts */
      }
    }
    const sub = form.watch((values) => store.setItem(key, JSON.stringify(persistable(values))));
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, key]);
}
