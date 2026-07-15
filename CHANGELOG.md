# Changelog

## 2.0.0 (2026-07-15)

The "describe it, don't build it" release. Full details: [MIGRATION.md](./MIGRATION.md),
[docs/PRD-v2.md](./docs/PRD-v2.md).

### Added
- **Repeatable groups**: `type: "array"` + `item.fields`, add/remove/reorder,
  `validation.minItems`/`maxItems`, row-relative conditions (`$.` escapes to root),
  nesting to 3 levels, `ArrayField`/`ArrayItem` slots.
- **Computed fields & reactions**: `computed: { formula, inputs }` + `formulas` prop
  (per-row in arrays, whole-array inputs for totals); `effects: [{ when, set }]`;
  dev-time cycle detection.
- **Typed values**: `defineSchema`, `InferValues<typeof schema>`, `FormRender<TValues>`.
- **Async validation v2**: results survive sync re-validation, are re-checked at
  submit (blocking), expose `validating` (gates the submit button).
- **Condition operators**: `isEmpty`, `matches`, `contains`, `containsAny`, and
  field-to-field comparison `{ "$field": "other" }`.
- **Custom cross-field rules**: `{ type: "custom", validator }` + `validators` prop.
- **Uploads**: `uploaders` prop + `field.upload` — upload on selection with per-file
  progress, submit gating, automatic File→URL swap in the payload.
- **Wizard**: `onStepChange`, controlled `step`/`onStepRequest`, clickable stepper,
  `review: true` summary steps (new `Review` slot), focus management on step change.
- **Input masks** (`9`/`a`/`*` tokens), `tooltip` rendering, `settings.columns`,
  `settings.hiddenValues: "keep"`, `{value}` interpolation in messages.
- **Loader states**: `optionsState.loading`/`error` + `AbortSignal` to loaders.
- **Persistence v2**: debounced, versioned payloads, `migrateDraft`, cleared on submit.
- **AI**: `schema-form-engine/ai` (`generateFormSchema`, `AI_SYSTEM_PROMPT`),
  `npx schema-form-engine generate` / `validate`, official JSON Schema at
  `schema-form-engine/schema.json`.
- **Adapters**: MUI + Ant Design templates (`add mui` / `add antd`); a11y pass across
  the HTML adapter (`aria-invalid`, `aria-describedby`, radio-group labelling).
- `"use client"` banners on the React bundles (Next.js App Router friendly); the
  `ai` subpath ships without one (server-safe).

### Changed / Breaking
- zod peer floor `>=3.25` (Zod 4 supported; pair with resolvers ≥5 on Zod 4).
- Field names may not contain `.`; schema arrays are `readonly`-typed.
- `StepperSlotProps` gained `visited` + `onStepClick`.
- Numeric select/radio option values submit as numbers.
- Draft storage format is versioned; v1 drafts are discarded.

## 0.1.3

v1 — initial public release.
