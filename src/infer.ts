/**
 * Schema → TypeScript value inference.
 *
 * Author the schema with `defineSchema` (or `as const satisfies FormSchema`) so
 * field literals are preserved, then derive the submitted-values type:
 *
 *   const schema = defineSchema({
 *     id: "signup", version: 1,
 *     fields: [
 *       { name: "email", type: "email", validation: { required: { message: "Required" } } },
 *       { name: "age", type: "number" },
 *       { name: "plan", type: "select", options: [{ value: "free", label: "Free" }] },
 *     ],
 *   });
 *   type Values = InferValues<typeof schema>;
 *   // { email: string; age?: number; plan?: "free" }
 *
 * Rules: `validation.required` makes a key non-optional; action fields
 * (button/submit/reset/image) are excluded; select/radio/multiselect narrow to
 * their literal option values when options are declared inline; unknown custom
 * field types infer as `unknown`.
 */
import type { FormSchema } from "./types";

/**
 * Identity helper that preserves literal types (via a `const` type parameter)
 * while still checking the object against `FormSchema`. Preferred over
 * `as const satisfies FormSchema` — same effect, less syntax.
 */
export function defineSchema<const S extends FormSchema>(schema: S): S {
  return schema;
}

type ActionType = "button" | "submit" | "reset" | "image";

/** Field types whose value is a plain string. */
type StringValued =
  | "text"
  | "email"
  | "password"
  | "search"
  | "tel"
  | "url"
  | "color"
  | "date"
  | "datetime-local"
  | "month"
  | "time"
  | "week"
  | "textarea"
  | "hidden"
  | "radio"; // narrowed to option literals below when options are inline

/** Union of every authored field object in the schema (single-page or steps). */
type AnyFieldOf<S> =
  | (S extends { fields: readonly (infer F)[] } ? F : never)
  | (S extends { steps: readonly (infer St)[] }
      ? St extends { fields: readonly (infer F)[] }
        ? F
        : never
      : never);

type ValueFieldOf<S> = Exclude<AnyFieldOf<S>, { type: ActionType }>;

/** Literal option values when declared inline; otherwise the loose union. */
type OptionValueOf<F> = F extends {
  options: readonly { value: infer V extends string | number }[];
}
  ? V
  : string | number;

type FieldValueOf<F> = F extends { type: "array"; item: { fields: readonly (infer RF)[] } }
  ? FieldsValues<Exclude<RF, { type: ActionType }>>[] // rows recurse
  : F extends { type: "number" | "range" }
    ? number
    : F extends { type: "checkbox" | "switch" }
      ? boolean
      : F extends { type: "multiselect" }
        ? OptionValueOf<F>[]
        : F extends { type: "select"; multiple: true }
          ? OptionValueOf<F>[]
          : F extends { type: "select" | "radio" }
            ? OptionValueOf<F>
            : F extends { type: "file"; multiple: true }
              ? File[]
              : F extends { type: "file" }
                ? File
                : F extends { type: StringValued }
                  ? string
                  : unknown; // custom field types registered in the component map

type NameOf<F> = F extends { name: infer N extends string } ? N : never;

/** Names of fields with a static `validation.required` rule. */
type RequiredNameOf<F> = F extends {
  name: infer N extends string;
  validation: { required: { message: string } };
}
  ? N
  : never;

type Prettify<T> = { [K in keyof T]: T[K] } & {};

/** Map a union of field objects to their values shape (required + optional keys). */
type FieldsValues<Fs> = Prettify<
  {
    [N in RequiredNameOf<Fs>]: FieldValueOf<Extract<Fs, { name: N }>>;
  } & {
    [N in Exclude<NameOf<Fs>, RequiredNameOf<Fs>>]?: FieldValueOf<Extract<Fs, { name: N }>>;
  }
>;

/**
 * The submitted-values type for a schema. Requires a literal schema type
 * (`defineSchema` / `as const`); a plain `FormSchema` infers as a loose record.
 */
export type InferValues<S extends FormSchema> = FieldsValues<ValueFieldOf<S>>;
