import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FormProvider, useForm, useFormContext, useWatch } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { buildDefaults } from "../compile/defaults";
import { allFields, getSteps, isActionField } from "../compile/schema-utils";
import { validateSchema } from "../compile/validate";
import { compileZod } from "../compile/zod";
import { createAsyncRegistry, ensureAsyncValid, mergeAsyncErrors } from "../engine/async";
import { evaluateVisibility, extractDeps } from "../engine/condition";
import { defaultTranslate } from "../engine/i18n";
import { stripHiddenValues } from "../engine/stripHidden";
import { createUploadRegistry, resolveUploads } from "../engine/uploads";
import type {
  ComponentMap,
  Field,
  FormSchema,
  FormSlots,
  FormulaMap,
  FormValues,
  LoaderMap,
  ResolverMap,
  SubmitResult,
  TranslateFn,
  UploaderMap,
  ValidatorMap,
} from "../types";
import { cn } from "../utils/cn";
import { FormRenderProvider, useFormRenderContext } from "./context";
import { defaultSlots } from "./defaultSlots";
import { StepBody } from "./StepBody";

export interface FormRenderProps<TValues extends FormValues = FormValues> {
  schema: FormSchema;
  components: ComponentMap;
  onSubmit: (values: TValues) => void | SubmitResult | Promise<void | SubmitResult>;
  onReset?: () => void;
  onAction?: (action: string, values: TValues) => void;
  resolvers?: ResolverMap;
  loaders?: LoaderMap;
  /** formulas for `computed` fields, keyed by `computed.formula` */
  formulas?: FormulaMap;
  /** cross-field validators for `{ type: "custom" }` rules */
  validators?: ValidatorMap;
  /**
   * Uploaders for file fields with `upload`. Files upload on selection (with
   * progress); at submit, Files are swapped for the uploaded URLs and submit
   * is gated on in-flight/failed uploads.
   */
  uploaders?: UploaderMap;
  /**
   * Upgrade a persisted draft saved under an older `schema.version`. Return
   * the migrated values, or null to discard the draft. Without this, drafts
   * from other versions are discarded.
   */
  migrateDraft?: (draft: FormValues, savedVersion: number) => FormValues | null;
  /** fired after the wizard moves (index within the visible step sequence) */
  onStepChange?: (index: number, direction: "next" | "back" | "jump") => void;
  /** controlled step index — pair with onStepRequest; omit for internal state */
  step?: number;
  /** controlled mode: called when the form wants to move; update `step` to comply */
  onStepRequest?: (index: number) => void;
  t?: TranslateFn;
  /**
   * Initial field values, read **once** on mount (React Hook Form semantics).
   * Use for create-mode prefill or when the data is already available at first
   * render. Merged over the schema's per-field defaults — partial is fine.
   */
  defaultValues?: Partial<TValues>;
  /**
   * Edit-mode prefill that **syncs after mount**. When this object changes the
   * form re-initialises to it (so async-fetched records work without remounting
   * via `key`), while keeping fields the user has already edited. Also merged
   * over the schema defaults. Leave undefined for create mode.
   */
  values?: Partial<TValues>;
  className?: string;
  /**
   * Override any UI slot (Button, FieldWrapper, Title, Stepper, Step, Section,
   * Grid, Cell, Actions). Omitted slots use the default `fr-*` markup. Pass a
   * full shadcn bundle to render the form with zero custom markup.
   */
  slots?: Partial<FormSlots>;
}

// Stable defaults for the injectable maps: fresh `{}` literals per render would
// sit in the resolver/context memo deps and defeat them (recompiling Zod and
// re-rendering every field on each parent render when the props are omitted).
const EMPTY_RESOLVERS: ResolverMap = {};
const EMPTY_LOADERS: LoaderMap = {};
const EMPTY_FORMULAS: FormulaMap = {};
const EMPTY_VALIDATORS: ValidatorMap = {};
const EMPTY_UPLOADERS: UploaderMap = {};

/**
 * Type the submitted values by passing a generic (usually via `InferValues`):
 *
 *   const schema = defineSchema({ ... });
 *   <FormRender<InferValues<typeof schema>> schema={schema} onSubmit={(v) => v.email} ... />
 *
 * Without a generic, values stay `Record<string, unknown>` (v1 behavior).
 */
export function FormRender<TValues extends FormValues = FormValues>({
  schema,
  components,
  onSubmit,
  onReset,
  onAction,
  resolvers = EMPTY_RESOLVERS,
  loaders = EMPTY_LOADERS,
  formulas = EMPTY_FORMULAS,
  validators = EMPTY_VALIDATORS,
  uploaders = EMPTY_UPLOADERS,
  migrateDraft,
  onStepChange,
  step,
  onStepRequest,
  t = defaultTranslate,
  defaultValues,
  values,
  className,
  slots,
}: FormRenderProps<TValues>) {
  const mergedSlots = useMemo<FormSlots>(() => ({ ...defaultSlots, ...slots }), [slots]);
  // dev-time schema sanity check (duplicate names, unknown refs)
  useMemo(() => {
    if (process.env.NODE_ENV !== "production") validateSchema(schema);
  }, [schema]);

  const asyncRegistry = useMemo(createAsyncRegistry, []);
  const uploadRegistry = useMemo(createUploadRegistry, []);
  // wrap the Zod resolver so registered async failures survive sync re-validation
  const resolver = useMemo(() => {
    const sync = zodResolver(compileZod(schema, t, validators));
    return async (vals: FormValues, ctx: unknown, options: unknown) => {
      const result = await (sync as (...args: unknown[]) => Promise<{ values: unknown; errors: Record<string, unknown> }>)(
        vals,
        ctx,
        options,
      );
      return mergeAsyncErrors(result, vals, asyncRegistry);
    };
  }, [schema, t, validators, asyncRegistry]);
  const initialValues = useMemo(
    () => buildDefaults(schema, defaultValues as FormValues | undefined),
    [schema, defaultValues],
  );
  // edit-mode: re-sync to fresh data after mount, but keep the user's edits.
  const syncedValues = useMemo(
    () => (values ? buildDefaults(schema, values as FormValues) : undefined),
    [schema, values],
  );

  const form = useForm<FormValues>({
    resolver: resolver as Resolver<FormValues>,
    defaultValues: initialValues,
    values: syncedValues,
    resetOptions: { keepDirtyValues: true },
    mode: mapMode(schema.settings?.validateOn),
    reValidateMode: "onChange",
    shouldFocusError: true,
  });

  const clearDraft = usePersistence(schema, form, migrateDraft);

  // stable context value so fields don't re-render on unrelated parent renders
  const contextValue = useMemo(
    () => ({
      components,
      resolvers,
      loaders,
      formulas,
      uploaders,
      asyncRegistry,
      uploadRegistry,
      columns: schema.settings?.columns ?? 12,
      hiddenValues: schema.settings?.hiddenValues ?? ("clear" as const),
      t,
      slots: mergedSlots,
      classNames: schema.classNames,
    }),
    [
      components,
      resolvers,
      loaders,
      formulas,
      uploaders,
      asyncRegistry,
      uploadRegistry,
      t,
      mergedSlots,
      schema,
    ],
  );

  return (
    <FormRenderProvider value={contextValue}>
      <FormProvider {...form}>
        <FormInner
          schema={schema}
          className={className}
          // values reaching these are already validated/shaped, so the widening cast is safe
          onSubmit={onSubmit as (values: FormValues) => void | SubmitResult | Promise<void | SubmitResult>}
          onReset={onReset}
          onAction={onAction as ((action: string, values: FormValues) => void) | undefined}
          clearDraft={clearDraft}
          onStepChange={onStepChange}
          controlledStep={step}
          onStepRequest={onStepRequest}
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
  clearDraft,
  onStepChange,
  controlledStep,
  onStepRequest,
  t,
}: Pick<FormRenderProps, "schema" | "className" | "onSubmit" | "onReset" | "onAction"> & {
  clearDraft: () => void;
  onStepChange?: (index: number, direction: "next" | "back" | "jump") => void;
  controlledStep?: number;
  onStepRequest?: (index: number) => void;
  t: TranslateFn;
}) {
  const form = useFormContext<FormValues>();
  const { slots, resolvers, uploaders, asyncRegistry, uploadRegistry, hiddenValues } =
    useFormRenderContext();
  const { Button, Title, Stepper, Step, Actions, Review } = slots;
  // any in-flight async validation gates the submit button
  const validating = useSyncExternalStore(
    asyncRegistry.subscribe,
    asyncRegistry.anyValidating,
    () => false,
  );
  // ...and so does any in-flight upload
  const uploading = useSyncExternalStore(
    uploadRegistry.subscribe,
    uploadRegistry.anyUploading,
    () => false,
  );

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

  // controlled (step + onStepRequest props) or internal step state
  const [internalIndex, setInternalIndex] = useState(0);
  const stepIndex = controlledStep ?? internalIndex;
  const clamped = Math.min(stepIndex, Math.max(0, visibleSteps.length - 1));
  const current = visibleSteps[clamped];
  const isLast = clamped === visibleSteps.length - 1;
  const isMultiStep = visibleSteps.length > 1;
  const gated = (schema.settings?.stepValidation ?? "gated") === "gated";
  const nav = schema.settings?.navigation ?? {};

  const maxVisited = useRef(0);
  maxVisited.current = Math.max(maxVisited.current, clamped);

  function requestStep(index: number, direction: "next" | "back" | "jump") {
    if (controlledStep !== undefined) onStepRequest?.(index);
    else setInternalIndex(index);
    onStepChange?.(index, direction);
  }

  // move focus to the step container when the wizard moves (screen readers +
  // keyboard users land at the new step instead of a stale button)
  const stepFocusRef = useRef<HTMLDivElement | null>(null);
  const prevStep = useRef(clamped);
  useEffect(() => {
    if (prevStep.current !== clamped) stepFocusRef.current?.focus();
    prevStep.current = clamped;
  }, [clamped]);

  const submit = form.handleSubmit(async (values) => {
    // async gate: re-run stale/unrun async validators; block submit on failure
    let focused = false;
    const asyncOk = await ensureAsyncValid(
      allFields(schema),
      values,
      resolvers,
      asyncRegistry,
      (name, error) => {
        form.setError(name, error, { shouldFocus: !focused });
        focused = true;
      },
      t,
    );
    if (!asyncOk) return;

    // upload gate: block on in-flight/failed uploads; swap Files → URLs
    const uploadResult = resolveUploads(
      allFields(schema),
      values,
      uploadRegistry,
      uploaders,
      (name, error) => form.setError(name, error),
      t,
    );
    if (!uploadResult.ok) return;

    const payload =
      hiddenValues === "keep"
        ? stripHiddenValues(allFields(schema), uploadResult.payload)
        : uploadResult.payload;
    const result = await onSubmit(payload);
    if (result?.errors) {
      const entries = Object.entries(result.errors);
      entries.forEach(([name, message]) => form.setError(name, { type: "server", message }));
      if (entries[0]) form.setFocus(entries[0][0]);
      return;
    }
    clearDraft(); // successful submit → the saved draft has served its purpose
  });

  async function goNext() {
    if (gated && !current?.review) {
      const names = current?.fields.map((f) => f.name) ?? [];
      const ok = await form.trigger(names);
      if (!ok) return;
    }
    requestStep(clamped + 1, "next");
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

  /** Review-step summary: every previous visible step's visible value fields. */
  function reviewGroups() {
    const values = form.getValues();
    return visibleSteps
      .map((s, index) => ({ step: s, index }))
      .filter(({ step: s }) => !s.review)
      .map(({ step: s, index }) => ({
        id: s.id,
        title: t(s.title),
        index,
        items: s.fields
          .filter((f) => !isActionField(f) && evaluateVisibility(f.visibleWhen, values))
          .map((f) => ({
            name: f.name,
            label: f.label ? t(f.label) : f.name,
            value: values[f.name],
          })),
      }));
  }

  return (
    <form onSubmit={submit} noValidate className={cn("fr-form", className)}>
      {schema.title && <Title>{t(schema.title)}</Title>}

      {isMultiStep && (
        <Stepper
          steps={visibleSteps.map((s, i) => ({
            id: s.id,
            title: t(s.title),
            visited: i <= maxVisited.current,
          }))}
          current={clamped}
          onStepClick={(i) => {
            if (i !== clamped && i <= maxVisited.current) requestStep(i, "jump");
          }}
        />
      )}

      {current && (
        <div ref={stepFocusRef} tabIndex={-1} className="fr-step-focus" style={{ outline: "none" }}>
          <Step
            title={isMultiStep && current.title ? t(current.title) : undefined}
            description={current.description ? t(current.description) : undefined}
            disabled={form.formState.isSubmitting}
          >
            {current.review ? (
              <Review
                groups={reviewGroups()}
                onEdit={(i) => requestStep(i, "jump")}
                editLabel={t("Edit")}
              />
            ) : (
              <StepBody step={current} />
            )}
          </Step>
        </div>
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
          <Button type="button" variant="outline" onClick={() => requestStep(clamped - 1, "back")}>
            {t(nav.back ?? "Back")}
          </Button>
        )}
        {isMultiStep && !isLast ? (
          <Button type="button" variant="primary" onClick={goNext}>
            {t(nav.next ?? "Next")}
          </Button>
        ) : (
          <Button
            type="submit"
            variant="primary"
            disabled={form.formState.isSubmitting || validating || uploading}
          >
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

const PERSIST_DEBOUNCE_MS = 300;

/**
 * Draft persistence (v2). The payload is versioned (`{ __v, values }`): a
 * draft saved under another schema.version is discarded unless `migrateDraft`
 * upgrades it. Writes are debounced; the returned function clears the draft
 * (called after a successful submit).
 */
function usePersistence(
  schema: FormSchema,
  form: ReturnType<typeof useForm<FormValues>>,
  migrateDraft?: (draft: FormValues, savedVersion: number) => FormValues | null,
): () => void {
  const mode = schema.settings?.persist ?? "none";
  const key = `form-render:${schema.id}`;
  const migrate = useRef(migrateDraft);
  migrate.current = migrateDraft;
  // hook-scoped so clearDraft can cancel an in-flight debounced write —
  // otherwise a pending timer could resurrect the draft right after clearing
  const writeTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (mode === "none" || typeof window === "undefined") return;
    const store = mode === "local" ? window.localStorage : window.sessionStorage;
    const saved = store.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { __v?: unknown; values?: unknown };
        let draft: FormValues | null = null;
        if (parsed && typeof parsed === "object" && typeof parsed.__v === "number") {
          if (parsed.__v === schema.version) draft = (parsed.values as FormValues) ?? null;
          else if (migrate.current) draft = migrate.current(parsed.values as FormValues, parsed.__v);
        }
        // v1 unversioned payloads (a bare values object) are treated as stale
        if (draft) form.reset({ ...form.getValues(), ...draft });
        else if (!draft && parsed && typeof parsed.__v === "number" && parsed.__v !== schema.version)
          store.removeItem(key); // discarded stale draft
      } catch {
        /* ignore corrupt drafts */
      }
    }
    const sub = form.watch((values) => {
      clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(() => {
        store.setItem(key, JSON.stringify({ __v: schema.version, values: persistable(values) }));
      }, PERSIST_DEBOUNCE_MS);
    });
    return () => {
      clearTimeout(writeTimer.current);
      sub.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, key, schema.version]);

  return useCallback(() => {
    if (mode === "none" || typeof window === "undefined") return;
    clearTimeout(writeTimer.current);
    const store = mode === "local" ? window.localStorage : window.sessionStorage;
    store.removeItem(key);
  }, [mode, key]);
}
