# Changelog

## 2.2.0 (unreleased)

### Added
- **Chakra UI v3 adapter** (`form-render add chakra`): full slot set — controls,
  FieldWrapper, clickable Stepper, ArrayField/ArrayItem, Review. Native date
  inputs (Chakra ships no picker; header comment covers swapping one in).
- **Mantine v8 adapter** (`form-render add mantine`): full slot set with
  `@mantine/dates` date/datetime/month/time pickers and Mantine Stepper.
- **Adapter compile harness** (`npm run check:adapters`, runs in release CI):
  every bundled template is typechecked against its REAL UI library
  (@chakra-ui/react 3, @mantine/core 8, @mui/material, antd) and the built
  engine — templates can no longer drift out of compilability.
- `docs/adapters.md` parity matrix (the acceptance contract for adapters) and
  `docs/react-native.md` (RN investigation: headless render mode targeted at v3).

### Fixed
- shadcn template: `toAccept` now takes `readonly string[]` (matches
  `Field.accept`) — caught by the new harness.

## 2.1.0 (unreleased)

### Added
- **MCP server** (`schema-form-engine/mcp` + `form-render mcp`): serve the engine
  to Claude Code / Cursor / any Model Context Protocol client over stdio. Tools:
  `validate_form_schema`, `get_schema_reference`, `list_field_types` (offline) and
  `generate_form_schema` (description and/or screenshot, provider key from env).
  `@modelcontextprotocol/sdk` is an optional peer dependency, lazy-imported.
- **Schema diffing**: `diffSchemas(a, b, { strict? })` exported from the root, and
  `form-render diff <old> <new>` with `--json`, `--strict`, `--verbose`,
  `--allow-invalid`, `--fail-on breaking|risky`. Findings are classified
  breaking / risky / cosmetic by impact on existing payloads, with a rename
  heuristic, array/step awareness, and deterministic CI-friendly output
  (exit 0/1/2).

## 2.0.1 (2026-07-15)

- Ship `MIGRATION.md` and `CHANGELOG.md` inside the npm package (the README
  linked to them, but they were missing from the tarball).
- Releases are now published from CI with npm provenance.

## 2.0.0 (2026-07-15)

The "describe it, don't build it" release. Full migration details: [MIGRATION.md](./MIGRATION.md).

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
