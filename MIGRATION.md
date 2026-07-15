# Migrating from v0.1.x (v1) to v2

v2 is a superset of v1 in spirit: **most v1 schemas and adapters work
unchanged**. The breaking changes are few and mechanical.

## Requirements

| | v1 | v2 |
|---|---|---|
| zod | `>=3.22` | `>=3.25` (Zod 4 fully supported) |
| @hookform/resolvers | `>=3` | `>=3` with Zod 3 · **`>=5` required with Zod 4** |
| react / react-hook-form | `>=18` / `>=7.45` | unchanged (React 19 works) |

## Breaking changes

1. **Field names must not contain dots.** Names are path segments now (nesting
   comes from `type: "array"`). `validateSchema` throws on dotted names.
2. **Persisted drafts are versioned.** v2 stores `{ __v: schema.version, values }`
   and discards drafts saved under a different version (or v1's bare-object
   format). Pass `migrateDraft={(draft, from) => …}` to upgrade instead of
   discard. Drafts are also cleared automatically after a successful submit.
3. **Custom `Stepper` slots:** `steps` entries gained `visited: boolean`, and
   the slot receives `onStepClick` — update your component's props type.
4. **Custom `FieldWrapper` slots:** new optional props (`tooltip`, `validating`,
   `descriptionId`, `errorId`). Nothing breaks if you ignore them, but wire
   `descriptionId`/`errorId` through for correct `aria-describedby`.
5. **Numeric option values stay numeric.** A select with `{ "value": 1 }` now
   submits `1`, not `"1"`. If your backend relied on the stringified value,
   adjust (or declare string values).
6. **Async validation errors** are managed by an internal registry and are
   re-checked at submit. Code that inspected `error.type === "async"` still
   works, but errors now persist through unrelated re-validation (that's the
   fix) and clear when the value changes.
7. **Schema types use `readonly` arrays.** Mutable arrays still assign fine;
   only code that *mutated* a schema object needs a copy. This is what makes
   `as const` schemas (and `InferValues`) work.
8. **`mask` now does something.** It was a dead key in v1; if you had stray
   `mask` values in schemas, they'll start formatting input.

## New in v2 (opt-in, no migration needed)

Repeatable groups (`type: "array"`), computed fields + `formulas`, effects,
`defineSchema` + `InferValues<typeof schema>`, `FormRender<TValues>`, richer
condition operators (`isEmpty`, `matches`, `contains`, `{ "$field": … }`),
custom rules + `validators`, loader loading/error states with abort,
`uploaders` with per-file progress and File→URL swap at submit, wizard
`onStepChange` / controlled `step` / clickable stepper / `review` steps,
`settings.columns`, `settings.hiddenValues: "keep"`, `tooltip`, input `mask`,
`{value}` message interpolation, the official JSON Schema
(`schema-form-engine/schema.json`), and AI generation
(`schema-form-engine/ai`, `npx schema-form-engine generate`).

## Running v1 and v2 side by side

npm aliases let old forms stay on v1 while new ones use v2 in the same app:

```bash
npm i schema-form-engine@2
npm i schema-form-engine-v1@npm:schema-form-engine@0.1.3
```

```tsx
import { FormRender } from "schema-form-engine";                       // v2
import { FormRender as FormRenderV1 } from "schema-form-engine-v1";    // v1
```

Each `<FormRender>` is fully self-contained (own provider/context, no shared
globals), and v2's versioned draft payloads don't collide with v1 drafts. The
only shared constraint is peers: use zod ≥3.25 (both accept it) and match
resolvers to your zod major (see table above).
