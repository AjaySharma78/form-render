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

/** Reserved for v2 (repeatable groups). */
export type ContainerFieldType = "array";

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

export type Condition =
  | { field: string; is: string | number | boolean }
  | { field: string; not: string | number | boolean }
  | { field: string; in: (string | number)[] }
  | { field: string; gt: number }
  | { field: string; lt: number }
  | { field: string; gte: number }
  | { field: string; lte: number }
  | { field: string; notEmpty: true };

/** A condition tree. `all` = AND, `any` = OR; both are nestable. */
export type Visibility = Condition | { all: Visibility[] } | { any: Visibility[] };

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
  fileTypes?: Rule<string[]>;
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
  dependsOn?: string[];
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
  options?: FieldOption[];
  optionsSource?: OptionsSource;
  clearable?: boolean;

  // textarea / numeric / date
  rows?: number;
  step?: number;
  min?: number | string;
  max?: number | string;

  // file
  accept?: string[];
  /** `file`: allow multiple files. `select`: turn it into a multi-select (array value). */
  multiple?: boolean;

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

  // conditional behaviour
  visibleWhen?: Visibility;
  requiredWhen?: Condition;
  disabledWhen?: Condition;

  // validation
  validation?: Validation;
  asyncValidation?: AsyncValidation;

  // custom field passthrough
  props?: Record<string, unknown>;

  // styling
  className?: string;
  classNames?: FieldClassNames;
  style?: CSSProperties;
}

// ─────────────────────── cross-field rules ─────────────────────────────

export type FormRule =
  | { type: "equals"; fields: [string, string]; path: string; message: I18nKey }
  | {
      type: "gt" | "lt" | "gte" | "lte";
      fields: [string, string];
      path: string;
      message: I18nKey;
    }
  | { type: "requiredIf"; field: string; when: Condition; path: string; message: I18nKey };

// ─────────────────────── layout & sections ─────────────────────────────

export interface LayoutCell {
  field: string;
  /** 1–12 grid units */
  span?: number;
}
export type LayoutRow = (string | LayoutCell)[];

export interface Section {
  id: string;
  title?: I18nKey;
  description?: I18nKey;
  collapsible?: boolean;
  defaultOpen?: boolean;
  visibleWhen?: Visibility;
  /** field names placed in this section */
  fields: string[];
  /** explicit row layout for this section (rows of field names); falls back to per-field width */
  layout?: LayoutRow[];
}

export interface Step {
  id: string;
  title: I18nKey;
  description?: I18nKey;
  fields: Field[];
  sections?: Section[];
  layout?: LayoutRow[];
  /** a hidden step is removed from the wizard sequence + step count */
  visibleWhen?: Visibility;
}

// ─────────────────────── settings & schema ─────────────────────────────

export interface FormSettings {
  columns?: number;
  validateOn?: "onChange" | "onBlur" | "onSubmit";
  /** gated = Next disabled until current step's visible fields validate */
  stepValidation?: "gated" | "free";
  navigation?: { next?: I18nKey; back?: I18nKey; finish?: I18nKey };
  persist?: "none" | "local" | "session";
}

export interface FormSchema {
  id: string;
  title?: I18nKey;
  version: number;
  settings?: FormSettings;
  classNames?: FieldClassNames;
  rules?: FormRule[];

  // single-page form (use these) ...
  fields?: Field[];
  layout?: LayoutRow[];
  sections?: Section[];

  // ... OR multi-step form (use this)
  steps?: Step[];

  /** extra buttons only; Back/Next/Finish are generated automatically */
  actions?: Field[];
}

// ─────────────────────── runtime contracts ─────────────────────────────

export type FormValues = Record<string, unknown>;

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

/** Injected option loaders, keyed by OptionsSource.loader. */
export type LoaderMap = Record<
  string,
  (deps: Record<string, unknown>) => Promise<FieldOption[]>
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
  error?: string;
  required: boolean;
  invalid: boolean;
  /** the rendered control */
  children: ReactNode;
}

export type FieldWrapper = ComponentType<FieldWrapperProps>;

// ── layout slots: every structural piece of the form is injectable ──

export interface ContainerSlotProps {
  children: ReactNode;
}
export interface StepperSlotProps {
  steps: { id: string; title: string }[];
  current: number;
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
}

/** What onSubmit may return to surface server-side errors. */
export interface SubmitResult {
  errors?: Record<string, string>;
}
