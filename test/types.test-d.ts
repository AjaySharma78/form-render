/**
 * Type-level tests for InferValues / defineSchema. Not executed at runtime --
 * checked by `npm run typecheck` (tsconfig.test.json). A wrong inference shows
 * up as a compile error here.
 */
import { expectTypeOf } from "vitest";
import { defineSchema } from "../src/infer";
import type { InferValues } from "../src/infer";

const schema = defineSchema({
  id: "signup",
  version: 2,
  fields: [
    { name: "email", type: "email", validation: { required: { message: "Required" } } },
    { name: "nickname", type: "text" },
    { name: "age", type: "number" },
    { name: "newsletter", type: "switch" },
    {
      name: "plan",
      type: "select",
      options: [
        { value: "free", label: "Free" },
        { value: "pro", label: "Pro" },
      ],
      validation: { required: { message: "Pick one" } },
    },
    {
      name: "tags",
      type: "select",
      multiple: true,
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
    },
    { name: "avatar", type: "file" },
    { name: "docs", type: "file", multiple: true },
    { name: "bio", type: "textarea" },
    { name: "rating", type: "starRating" }, // custom type -> unknown
    { name: "save", type: "submit", text: "Save" }, // action -> excluded
  ],
});

type Values = InferValues<typeof schema>;

// required fields are non-optional
expectTypeOf<Values["email"]>().toEqualTypeOf<string>();
expectTypeOf<Values["plan"]>().toEqualTypeOf<"free" | "pro">();

// optional fields allow undefined
expectTypeOf<Values["nickname"]>().toEqualTypeOf<string | undefined>();
expectTypeOf<Values["age"]>().toEqualTypeOf<number | undefined>();
expectTypeOf<Values["newsletter"]>().toEqualTypeOf<boolean | undefined>();

// multi-valued selects narrow to literal option arrays
expectTypeOf<Values["tags"]>().toEqualTypeOf<("a" | "b")[] | undefined>();

// files
expectTypeOf<Values["avatar"]>().toEqualTypeOf<File | undefined>();
expectTypeOf<Values["docs"]>().toEqualTypeOf<File[] | undefined>();

// text-like
expectTypeOf<Values["bio"]>().toEqualTypeOf<string | undefined>();

// custom field types infer as unknown
expectTypeOf<Values["rating"]>().toEqualTypeOf<unknown>();

// action fields are excluded from the value shape
// @ts-expect-error -- "save" is a submit button, not a value field
type _Save = Values["save"];

// array fields infer recursive row shapes (required/optional per row field)
const withArray = defineSchema({
  id: "arr",
  version: 2,
  fields: [
    {
      name: "contacts",
      type: "array",
      validation: { required: { message: "Add one" } },
      item: {
        fields: [
          { name: "cname", type: "text", validation: { required: { message: "r" } } },
          { name: "isPrimary", type: "switch" },
          {
            name: "phones",
            type: "array",
            item: { fields: [{ name: "num", type: "tel" }] },
          },
        ],
      },
    },
  ],
});

type ArrValues = InferValues<typeof withArray>;
expectTypeOf<ArrValues["contacts"]>().toEqualTypeOf<
  { cname: string; isPrimary?: boolean; phones?: { num?: string }[] }[]
>();

// multi-step schemas contribute fields from every step
const stepped = defineSchema({
  id: "wizard",
  version: 2,
  steps: [
    {
      id: "s1",
      title: "One",
      fields: [{ name: "first", type: "text", validation: { required: { message: "r" } } }],
    },
    { id: "s2", title: "Two", fields: [{ name: "second", type: "number" }] },
  ],
});

type SteppedValues = InferValues<typeof stepped>;
expectTypeOf<SteppedValues["first"]>().toEqualTypeOf<string>();
expectTypeOf<SteppedValues["second"]>().toEqualTypeOf<number | undefined>();
