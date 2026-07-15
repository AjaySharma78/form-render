/**
 * form-render — schema contract.
 *
 * A FormSchema is plain JSON. It compiles to a Zod schema (validation) and
 * drives React Hook Form (state). UI is rendered through an injected component
 * map, so the core imports zero UI.
 *
 * Any user-facing string (label, message, placeholder, ...) may be a plain
 * string OR a translation key resolved via the `t` function passed to
 * <FormRender>. See I18nKey.
 */
import type { ComponentType, CSSProperties, ReactNode } from "react";

/** A user-facing string. When a `t` function is supplied it is treated as a translation key. */
export type I18nKey = string;

// ───────────────────────────── field types ─────────────────────────────

/** Native input types + composite controls that hold a value. */
export type ValueFieldType =
  // text-like
  | "text"
  | "email"
  | "password"
  | "search"
  | "tel"
  | "url"
  // numeric
  | "number"
  | "range"
  // pickers
  | "color"
  | "date"
  | "datetime-local"
  | "month"
  | "time"
  | "week"
  // choice
  | "checkbox"
  | "switch"
  | "radio"
  | "select"
  | "multiselect"
  // text area / file / hidden
  | "textarea"
  | "file"
  | "hidden";

/** Controls that render as buttons and hold no value. */
export type ActionFieldType = "button" | "submit" | "reset" | "image";

/** Repeatable groups: `type: "array"` + an `item` spec describing each row. */
export type ContainerFieldType = "array";

/**
 * What each row of an array field contains. Row fields address siblings by
 * bare name in conditions; prefix with `$.` to reference a root-level field
 * (e.g. `{ "field": "$.plan", "is": "pro" }`). Arrays nest up to 3 levels.
 */
export interface ArrayItemSpec {
  fields: readonly Field[];
  /** explicit row layout inside each item; falls back to per-field width */
  layout?: readonly LayoutRow[];
}

/**
 * Any field type. Unknown strings are allowed so consumers can register
 * custom field components in the adapter map.
 */
export type FieldType =
  | ValueFieldType
  | ActionFieldType
  | ContainerFieldType
  // allow arbitrary custom types while keeping autocomplete on the known ones
  | (string & {});

// ───────────────────────────── conditions ──────────────────────────────

/** Compare against another field's value instead of a literal: `{ "gt": { "$field": "start" } }`. */
export interface FieldRef {
  $field: string;
}

export type Condition =
  | { field: string; is: string | number | boolean | FieldRef }
  | { field: string; not: string | number | boolean | FieldRef }
  | { field: string; in: readonly (string | number)[] }
  | { field: string; gt: number | FieldRef }
  | { field: string; lt: number | FieldRef }
  | { field: string; gte: number | FieldRef }
  | { field: string; lte: number | FieldRef }
  | { field: string; notEmpty: true }
  | { field: string; isEmpty: true }
  /** regex test (string values); source only, no flags */
  | { field: string; matches: string }
  /** array-valued fields (multiselect / multi-select): membership tests */
  | { field: string; contains: string | number }
  | { field: string; containsAny: readonly (string | number)[] };

/** A condition tree. `all` = AND, `any` = OR; both are nestable. */
export type Visibility =
  | Condition
  | { all: readonly Visibility[] }
  | { any: readonly Visibility[] };

// ─────────────────────── computed fields & effects ─────────────────────

/**
 * Derived value. The JSON names a formula; the function is injected via
 * <FormRender formulas={...}> and receives the current input values keyed by
 * the names written here. Recomputed on mount and whenever an input changes.
 * Inside array rows, bare input names address row siblings; `$.` = form root.
 */
export interface Computed {
  formula: string;
  inputs: readonly string[];
}

/**
 * Declarative reaction, attached to the field that triggers it: when THIS
 * field's value changes and `when` holds, the static values in `set` are
 * written to their target fields. Runs on change only — never on mount.
 * Bare target names address row siblings inside arrays; `$.` = form root.
 */
export interface Effect {
  when: Visibility;
  set: Record<string, unknown>;
}

// ───────────────────────────── validation ──────────────────────────────

export interface Rule<T = number | string> {
  value: T;
  message: I18nKey;
}

export interface Validation {
  required?: { message: I18nKey };
  pattern?: Rule<string>;
  minLength?: Rule<number>;
  maxLength?: Rule<number>;
  /** numeric bounds, or ISO date/time bounds (string) */
  min?: Rule<number | string>;
  max?: Rule<number | string>;
  /** multiselect */
  minItems?: Rule<number>;
  maxItems?: Rule<number>;
  email?: { message: I18nKey };
  url?: { message: I18nKey };
  /** file: maxSize in MB */
  maxSize?: Rule<number>;
  maxFiles?: Rule<number>;
  fileTypes?: Rule<readonly string[]>;
}

/**
 * Async validation runs on blur (debounced, abortable). The JSON names a
 * resolver; the actual function is injected via <FormRender resolvers={...}>.
 * Returning a string sets it as the field error; returning null/undefined clears it.
 */
export interface AsyncValidation {
  resolver: string;
  debounceMs?: number;
}

// ───────────────────────────── options ─────────────────────────────────

export interface FieldOption {
  value: string | number;
  label: I18nKey;
}

/**
 * Dynamic options. The JSON names a loader; the function is injected via
 * <FormRender loaders={...}>. `dependsOn` lists fields whose change re-runs the
 * loader and resets this field's value.
 */
export interface OptionsSource {
  loader: string;
  dependsOn?: readonly string[];
}

// ───────────────────────────── styling ─────────────────────────────────

export interface FieldClassNames {
  wrapper?: string;
  label?: string;
  control?: string;
  description?: string;
  error?: string;
}

// ───────────────────────────── field ───────────────────────────────────

export interface Field {
  /** Data key. Unique within the form, no spaces. Becomes the key in submitted values. */
  name: string;
  type: FieldType;
  label?: I18nKey;
  placeholder?: I18nKey;
  description?: I18nKey;
  tooltip?: I18nKey;
  default?: unknown;

  /** flow layout width; ignored when an explicit `layout` lists this field */
  width?: "full" | "half" | "third" | number;

  // choice
  options?: readonly FieldOption[];
  optionsSource?: OptionsSource;
  clearable?: boolean;

  // textarea / numeric / date
  rows?: number;
  step?: number;
  min?: number | string;
  max?: number | string;

  // file
  accept?: readonly string[];
  /** `file`: allow multiple files. `select`: turn it into a multi-select (array value). */
  multiple?: boolean;
  /**
   * `file`: name of an injected uploader (<FormRender uploaders={...}>).
   * Files upload as soon as they're selected (with progress); at submit the
   * File values are swapped for the uploaded URLs, and submit is blocked
   * while uploads are in flight or failed.
   */
  upload?: string;

  // array (repeatable group) — value is an array of row objects
  /** what each row contains; required when `type` is "array" */
  item?: ArrayItemSpec;
  /** label for the Add button (default "Add") */
  addText?: I18nKey;
  /** accessible label for each row's Remove button (default "Remove") */
  removeText?: I18nKey;
  /** number of empty rows the form starts with (default 0; `default` wins) */
  defaultItems?: number;
  /** render move up/down controls on rows */
  sortable?: boolean;
  /** row-count bounds live in `validation.minItems` / `validation.maxItems` */

  // action controls
  src?: string;
  alt?: I18nKey;
  text?: I18nKey;
  action?: string;

  // addons / input affordances
  prefix?: I18nKey;
  suffix?: I18nKey;
  mask?: string;

  // static state
  disabled?: boolean;
  readOnly?: boolean;

  // conditional behaviour (all accept nestable `all`/`any` trees)
  visibleWhen?: Visibility;
  requiredWhen?: Visibility;
  disabledWhen?: Visibility;

  // derived values & reactions
  /** derived value — renders read-only unless `editable` is set */
  computed?: Computed;
  /** allow user edits on a computed field (an input change still overwrites) */
  editable?: boolean;
  /** reactions fired when this field's value changes */
  effects?: readonly Effect[];

  // validation
  validation?: Validation;
  asyncValidation?: AsyncValidation;

  // custom field passthrough
  props?: Record<string, unknown>;

  // styling
  className?: string;
  classNames?: FieldClassNames;
  /**
   * Inline styles (runtime-only; excluded from the published JSON Schema).
   * @ignore
   */
  style?: CSSProperties;
}

// ─────────────────────── cross-field rules ─────────────────────────────

export type FormRule =
  | { type: "equals"; fields: readonly [string, string]; path: string; message: I18nKey }
  | {
      type: "gt" | "lt" | "gte" | "lte";
      fields: readonly [string, string];
      path: string;
      message: I18nKey;
    }
  | { type: "requiredIf"; field: string; when: Visibility; path: string; message: I18nKey }
  /** arbitrary check: the JSON names a validator injected via <FormRender validators={...}> */
  | { type: "custom"; validator: string; path: string; message: I18nKey };

/** Injected cross-field validators, keyed by the custom rule's `validator`. Return false to fail. */
export type ValidatorMap = Record<string, (values: FormValues) => boolean>;

// ─────────────────────── layout & sections ─────────────────────────────

export interface LayoutCell {
  field: string;
  /** 1–12 grid units */
  span?: number;
}
export type LayoutRow = readonly (string | LayoutCell)[];

export interface Section {
  id: string;
  title?: I18nKey;
  description?: I18nKey;
  collapsible?: boolean;
  defaultOpen?: boolean;
  visibleWhen?: Visibility;
  /** field names placed in this section */
  fields: readonly string[];
  /** explicit row layout for this section (rows of field names); falls back to per-field width */
  layout?: readonly LayoutRow[];
}

export interface Step {
  id: string;
  title: I18nKey;
  description?: I18nKey;
  fields: readonly Field[];
  sections?: readonly Section[];
  layout?: readonly LayoutRow[];
  /** a hidden step is removed from the wizard sequence + step count */
  visibleWhen?: Visibility;
  /**
   * Review step: renders a read-only summary of every previous step's visible
   * values with per-step Edit links (through the Review slot) instead of
   * fields. Usually the last step; `fields` should be [].
   */
  review?: boolean;
}

// ─────────────────────── settings & schema ─────────────────────────────

export interface FormSettings {
  /** grid columns the layout maps onto (default 12) */
  columns?: number;
  validateOn?: "onChange" | "onBlur" | "onSubmit";
  /** gated = Next disabled until current step's visible fields validate */
  stepValidation?: "gated" | "free";
  navigation?: { next?: I18nKey; back?: I18nKey; finish?: I18nKey };
  persist?: "none" | "local" | "session";
  /**
   * What happens to a field's value when it becomes hidden. "clear" (default,
   * v1 behavior) unregisters it — re-showing snaps back to the default.
   * "keep" retains the user's value in state while still excluding it from
   * validation and from the submitted payload.
   */
  hiddenValues?: "clear" | "keep";
}

export interface FormSchema {
  id: string;
  title?: I18nKey;
  version: number;
  settings?: FormSettings;
  classNames?: FieldClassNames;
  rules?: readonly FormRule[];

  // single-page form (use these) ...
  fields?: readonly Field[];
  layout?: readonly LayoutRow[];
  sections?: readonly Section[];

  // ... OR multi-step form (use this)
  steps?: readonly Step[];

  /** extra buttons only; Back/Next/Finish are generated automatically */
  actions?: readonly Field[];
}

// ─────────────────────── runtime contracts ─────────────────────────────

export type FormValues = Record<string, unknown>;

/** Loading/error state of a field's dynamic options (optionsSource). */
export interface OptionsState {
  options: readonly FieldOption[];
  loading: boolean;
  /** loader rejection message, if the last load failed */
  error?: string;
}

/** Props every field component (built-in or custom) receives. */
export interface FieldComponentProps<V = unknown> {
  field: Field;
  value: V;
  onChange: (value: V) => void;
  onBlur: () => void;
  /** resolved error message, if any */
  error?: string;
  /** DOM id to wire <label htmlFor> */
  id: string;
  disabled?: boolean;
  /** an async validation run is in flight for this field */
  validating?: boolean;
  /** dynamic options state (only set for fields with optionsSource) */
  optionsState?: OptionsState;
  /** space-joined ids of the rendered description/error nodes — wire to aria-describedby */
  describedBy?: string;
  /** per-file upload state, keyed by fileKey(file) — set for file fields with `upload` */
  uploads?: Record<string, FileUploadState>;
  /** translation function (already bound); use for option labels etc. */
  t: TranslateFn;
}

export type FieldComponent<V = unknown> = ComponentType<FieldComponentProps<V>>;

/** Maps a field `type` to the component that renders it. */
export type ComponentMap = Record<string, FieldComponent<any>>;

/** Injected async validators, keyed by AsyncValidation.resolver. */
export type ResolverMap = Record<
  string,
  (value: unknown, signal: AbortSignal) => Promise<string | null | undefined>
>;

/** Injected option loaders, keyed by OptionsSource.loader. Aborted when deps change or the field unmounts. */
export type LoaderMap = Record<
  string,
  (deps: Record<string, unknown>, signal?: AbortSignal) => Promise<readonly FieldOption[]>
>;

/**
 * Injected formulas for computed fields, keyed by Computed.formula. Receives
 * the current input values keyed by the names written in `computed.inputs`;
 * the return value becomes the field's value.
 */
export type FormulaMap = Record<string, (inputs: Record<string, unknown>) => unknown>;

/** Per-file upload progress, exposed to file components via `uploads`. */
export interface FileUploadState {
  status: "uploading" | "done" | "error";
  /** 0–100 */
  progress: number;
  /** resolved URL when done */
  url?: string;
  error?: string;
}

/**
 * Injected uploaders, keyed by Field.upload. Resolve to the stored file's URL;
 * report progress via onProgress; honor the AbortSignal (fired when the file
 * is removed or the form unmounts).
 */
export type UploaderMap = Record<
  string,
  (file: File, ctx: { signal: AbortSignal; onProgress: (percent: number) => void }) => Promise<string>
>;

export type TranslateFn = (key: I18nKey, vars?: Record<string, unknown>) => string;

/** Props the injectable Button slot receives (nav + action buttons). */
export interface ButtonSlotProps {
  type: "button" | "submit";
  /** semantic intent — map to your design system's button variants */
  variant: "primary" | "secondary" | "outline";
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}

/** Optional component used to render all nav/action buttons (e.g. shadcn Button). */
export type ButtonSlot = ComponentType<ButtonSlotProps>;

/**
 * Props the injectable field wrapper receives. It renders the field "chrome"
 * (label, description, error, invalid state) around the control (`children`).
 * Provide one to use your design system's field primitives, e.g. shadcn's
 * Field / FieldLabel / FieldError. Strings are already translated.
 */
export interface FieldWrapperProps {
  field: Field;
  /** DOM id shared by the label and the control */
  id: string;
  label?: string;
  description?: string;
  /** translated field.tooltip — render as a help icon / title */
  tooltip?: string;
  error?: string;
  required: boolean;
  invalid: boolean;
  /** an async validation run is in flight (show a spinner if you like) */
  validating?: boolean;
  /** put this id on the rendered description node (aria-describedby wiring) */
  descriptionId?: string;
  /** put this id on the rendered error node (aria-describedby wiring) */
  errorId?: string;
  /** the rendered control */
  children: ReactNode;
}

export type FieldWrapper = ComponentType<FieldWrapperProps>;

// ── layout slots: every structural piece of the form is injectable ──

export interface ContainerSlotProps {
  children: ReactNode;
}
export interface StepperSlotProps {
  steps: { id: string; title: string; visited: boolean }[];
  current: number;
  /** present when visited steps are navigable by clicking their chip */
  onStepClick?: (index: number) => void;
}
export interface StepSlotProps {
  title?: string;
  description?: string;
  disabled: boolean;
  children: ReactNode;
}
export interface SectionSlotProps {
  id: string;
  title?: string;
  description?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}
export interface GridSlotProps {
  columns: number;
  children: ReactNode;
}
export interface CellSlotProps {
  /** 1–12 grid units */
  span: number;
  children: ReactNode;
}

/** Container for a repeatable array field: label/description/error chrome + the Add control. */
export interface ArrayFieldSlotProps {
  field: Field;
  label?: string;
  description?: string;
  /** array-level error (minItems/maxItems/required) */
  error?: string;
  /** current row count */
  count: number;
  /** absent when maxItems is reached or the field is disabled */
  onAdd?: () => void;
  addLabel: string;
  children: ReactNode;
}

/** One field's entry in a review step summary. */
export interface ReviewItemData {
  name: string;
  label: string;
  value: unknown;
}
/** One (non-review) step's summary group. */
export interface ReviewGroupData {
  id: string;
  title: string;
  /** index in the visible step sequence — pass to onEdit to jump there */
  index: number;
  items: ReviewItemData[];
}
export interface ReviewSlotProps {
  groups: ReviewGroupData[];
  onEdit: (stepIndex: number) => void;
  editLabel: string;
}

/** One row of an array field: remove/reorder controls around the row's grid. */
export interface ArrayItemSlotProps {
  index: number;
  count: number;
  /** absent when minItems is reached or the field is disabled */
  onRemove?: () => void;
  removeLabel: string;
  /** present only when the field is `sortable` (and the move is possible) */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  children: ReactNode;
}

/**
 * The full set of injectable UI slots. Pass a partial set via
 * <FormRender slots={...}>; anything omitted falls back to the default
 * (semantic markup with `fr-*` classes). A shadcn bundle replaces all of
 * them with shadcn primitives so the form uses zero custom markup.
 */
export interface FormSlots {
  Button: ButtonSlot;
  FieldWrapper: FieldWrapper;
  Title: ComponentType<ContainerSlotProps>;
  Stepper: ComponentType<StepperSlotProps>;
  Step: ComponentType<StepSlotProps>;
  Section: ComponentType<SectionSlotProps>;
  Grid: ComponentType<GridSlotProps>;
  Cell: ComponentType<CellSlotProps>;
  Actions: ComponentType<ContainerSlotProps>;
  ArrayField: ComponentType<ArrayFieldSlotProps>;
  ArrayItem: ComponentType<ArrayItemSlotProps>;
  Review: ComponentType<ReviewSlotProps>;
}

/** What onSubmit may return to surface server-side errors. */
export interface SubmitResult {
  errors?: Record<string, string>;
}
