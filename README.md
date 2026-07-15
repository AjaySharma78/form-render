# schema-form-engine

Headless, **JSON-driven React forms**. A declarative schema compiles to a **Zod**
schema (validation) and drives **React Hook Form** (state). The UI is rendered
through an **injected component map**, so the core ships zero UI — bring your own
shadcn (recommended), MUI, or plain HTML components.

📖 **[Docs & live playground →](https://schema-form-engine.vercel.app/)**

## Why

- **One schema, full form.** Layout, conditional fields, validation, multi-step
  navigation, files, and styling all live in JSON.
- **No domain-specific arrays.** Conditional groups are expressed with
  `visibleWhen`, not bespoke arrays like `sshFields`.
- **shadcn-friendly.** The renderer takes a `components` map; you wire your own
  shadcn components (which live in your app, not node_modules).

## Install

```bash
npm i schema-form-engine react-hook-form zod @hookform/resolvers
```

> Needs `zod ≥3.25`. Using Zod 4? Pair it with `@hookform/resolvers@^5`.
> Upgrading from v1? See [MIGRATION.md](./MIGRATION.md) — v1 stays available as
> `schema-form-engine@0.1.3`.

## Quick start

```tsx
import { FormRender } from "schema-form-engine";
import { htmlComponents } from "schema-form-engine/adapters/html"; // built-in unstyled adapter
import { postgresSchema } from "./postgres";

export function ConnectionForm() {
  return (
    <FormRender
      schema={postgresSchema}
      components={htmlComponents}
      resolvers={{
        // async field validators named by the schema
        checkConnectionName: async (value, signal) => {
          const res = await fetch(`/api/check?name=${value}`, { signal });
          return (await res.json()).taken ? "That name is taken." : null;
        },
      }}
      onSubmit={async (values) => {
        const res = await saveConnection(values);
        if (!res.ok) return { errors: { host: "Could not reach host." } };
      }}
      onAction={(action, values) => action === "test" && testConnection(values)}
    />
  );
}
```

### Using shadcn

The shadcn adapter must live in *your* source tree (it imports your own
`@/components/ui/*`, which don't exist in `node_modules`). One command scaffolds
it **and** installs the shadcn components it uses:

```bash
npx schema-form-engine add shadcn
# → writes src/lib/form-render-shadcn.tsx (aliases matched to your components.json)
# → writes src/components/ui/dropzone.tsx (the file field's drag-and-drop input)
# → runs `shadcn add input textarea checkbox switch select radio-group label button field …`
# → installs react-dropzone + lucide-react (used by the file field + icons)
```

**What the shadcn path needs (we don't bundle any of it):**

- **Tailwind CSS + shadcn** set up in your app (a `components.json`). The CLI
  offers to run `shadcn init` if it isn't.
- **shadcn UI components** — `input`, `textarea`, `checkbox`, `switch`,
  `select`, `radio-group`, `label`, `button`, `field`, `popover`, `command`,
  `tooltip`, `calendar` (date/datetime/month pickers). The CLI runs
  `shadcn add` for these.
- **npm deps** — `react-dropzone` and `lucide-react`. The CLI installs both.
- **Peers** — `react`, `react-dom`, `react-hook-form`, `zod`,
  `@hookform/resolvers` (the same ones any `schema-form-engine` install needs).

The CLI prints this list when it finishes, so you always see what's required vs.
what it installed.

Flags: `--out <path>` (destination), `--force` (overwrite adapter + dropzone),
`--no-deps` (skip `shadcn add` and the npm deps — it then prints the exact
commands to run yourself), `--no-init` (don't auto-init). The CLI detects your
package manager (npm/pnpm/yarn/bun) and, if shadcn isn't set up yet, offers to
run `shadcn init` for you.

Then wire it up:

```tsx
import { FormRender } from "schema-form-engine";
import { shadcnComponents, shadcnSlots } from "./lib/form-render-shadcn";

<FormRender
  schema={schema}
  components={shadcnComponents}
  slots={shadcnSlots}   // render the ENTIRE form with shadcn primitives
  onSubmit={save}
/>;
```

> Prefer to copy by hand? The same files are in `templates/shadcn-adapter.tsx`
> and `templates/dropzone.tsx` (+ `npm i react-dropzone lucide-react`, plus the
> `shadcn add …` components listed above). The CLI just writes them for you,
> strips the template banner, and rewrites the `@/` imports to match your
> `components.json` aliases.

## ✨ Generate forms with AI (v2)

The schema is designed to be **LLM-generatable** — describe a form (or paste a
screenshot) and render the result directly:

```bash
export ANTHROPIC_API_KEY=sk-ant-…        # or OPENAI_API_KEY / GOOGLE_API_KEY
npx schema-form-engine generate "a job application form with repeatable work \
  experience, resume upload (pdf, max 5MB) and a review step" --out job.json
npx schema-form-engine validate job.json # exit-code checked — CI-friendly
```

Or server-side, with zero extra dependencies:

```ts
import { generateFormSchema } from "schema-form-engine/ai";

const { schema } = await generateFormSchema({
  prompt: "an event registration form with ticket quantity and computed total",
  provider: "anthropic",                 // or "openai" | "google"
  apiKey: process.env.ANTHROPIC_API_KEY!,
  // image: { base64, mediaType: "image/png" },  ← screenshot → working form
});
// already validated — render it: <FormRender schema={schema} … />
```

Output is checked with `validateSchema`; invalid attempts get one automatic
repair round with the errors fed back. Building your own agent? Import
`AI_SYSTEM_PROMPT` and the official JSON Schema
(`schema-form-engine/schema.json`) — add `"$schema"` to your form files for
editor autocomplete. Details in [docs/ai-prompt.md](docs/ai-prompt.md).

## Injectable slots — zero custom UI

The core ships **no markup of its own when you want shadcn**. Field controls come
from the `components` map; every *structural* piece is an injectable **slot**.
Pass a partial `slots` object; anything omitted falls back to default `fr-*`
markup you can style with plain CSS.

| Slot | Renders | shadcn impl |
|---|---|---|
| `components[type]` | the input control | `Input`, `Select`, `Checkbox`, … |
| `FieldWrapper` | label, description, error, invalid state | `Field` / `FieldLabel` / `FieldError` |
| `Button` | nav (Back/Next/Finish) + actions | `Button` |
| `Title` | form title | heading |
| `Stepper` | multi-step progress | badges |
| `Step` | step container | `FieldSet` / `FieldLegend` |
| `Section` | grouped fields | `FieldSet` / `FieldLegend` |
| `Grid` / `Cell` | 12-col layout | Tailwind `grid grid-cols-12` / `col-span-*` |
| `Actions` | button row | flex row |

With the shadcn bundle, **the rendered form contains only shadcn components +
Tailwind classes — no `fr-*` markup and no custom stylesheet.** `FieldWrapper`
gives you shadcn's native error styling (red label + ring + message); controls
always receive `aria-invalid` so the input's red ring works regardless.

Override just one piece by spreading the defaults:

```tsx
import { defaultSlots } from "schema-form-engine";
<FormRender slots={{ ...defaultSlots, Actions: MyActions }} … />
```

## Styling

The core ships **zero CSS** — the `html` adapter only emits stable `fr-*` class
hooks (`fr-form`, `fr-field`, `fr-control`, `fr-label`, `fr-error`, `fr-btn-*`,
`fr-stepper`, `fr-file`, …) plus `data-field`/`data-type`/`data-invalid`. Style
them however you like.

Want a batteries-included look without writing CSS? Import the **optional**
prebuilt stylesheet:

```tsx
import "schema-form-engine/styles.css";
```

It's a self-contained default theme scoped to `.fr-form` (so it won't touch the
rest of your app), with automatic dark mode (via `prefers-color-scheme`, or an
ancestor `.dark` / `[data-theme="dark"]`). Everything is driven by `--fr-*`
custom properties — override them globally or per form:

```css
.fr-form { --fr-primary: #0ea5e9; --fr-radius: 0.75rem; }
```

The stylesheet is entirely opt-in; skip the import and the package stays
CSS-free. (It styles the `html` adapter; the shadcn bundle is already styled by
your own components.)

## Schema at a glance

```jsonc
{
  "id": "signup", "version": 1,
  "settings": { "validateOn": "onBlur", "stepValidation": "gated" },
  "rules": [{ "type": "equals", "fields": ["password", "confirm"], "path": "confirm", "message": "Must match." }],
  "fields": [
    { "name": "email", "type": "email", "label": "Email",
      "validation": { "required": { "message": "Required" }, "email": { "message": "Invalid" } } },
    { "name": "useSsh", "type": "switch", "label": "Advanced" },
    { "name": "host", "type": "text", "label": "Host",
      "visibleWhen": { "field": "useSsh", "is": true } }
  ]
}
```

Key concepts:

| Concept | Field/Schema key |
|---|---|
| Conditional rendering | `visibleWhen` (`is`/`not`/`in`/`gt`/`lt`/`gte`/`lte`/`notEmpty`/`isEmpty`/`matches`/`contains`/`containsAny`, nest with `all`/`any`; compare fields with `{ "$field": "other" }`) |
| Conditional required/disabled | `requiredWhen`, `disabledWhen` (full condition trees) |
| Validation → Zod | `validation` (`required`, `pattern`, `min`/`max`, `minLength`, `email`, `url`, `maxSize`…) |
| Cross-field rules | top-level `rules` (`equals`/`gt`/…/`requiredIf`, or `{ "type": "custom", "validator": "name" }` + `validators` prop) |
| Async validation | `asyncValidation.resolver` + `resolvers` prop — runs on blur AND is re-checked at submit; in-flight state exposed as `validating` and gates the submit button |
| Dynamic options | `optionsSource.loader` + `loaders` prop (receives an `AbortSignal`; components get `optionsState.loading`/`error`) |
| Layout | per-field `width`, or explicit `layout` rows (on a step **or** a section); `sections` for grouping |
| Multi-step | `steps[]`; gated nav with auto Back/Next/Finish; steps can be `visibleWhen`; `onStepChange`, controlled `step`/`onStepRequest`, clickable stepper for visited steps, and `review: true` summary steps (v2) |
| Input masks (v2) | `mask: "(999) 999-9999"` (`9` digit, `a` letter, `*` alphanumeric) — masked display, raw value submitted |
| Tooltips & grid (v2) | `tooltip` renders as a label help hint; `settings.columns` sets the grid base (default 12) |
| Hidden values (v2) | `settings.hiddenValues: "keep"` preserves values across hide/show while still excluding them from validation + payload |
| Repeatable groups (v2) | `type: "array"` + `item.fields`; add/remove/reorder rows; `validation.minItems`/`maxItems`; row conditions use sibling names, `$.` escapes to root; nested to 3 levels |
| Typed values (v2) | `defineSchema(...)` + `InferValues<typeof schema>`; `<FormRender<Values>>` types `onSubmit` |
| Computed fields (v2) | `computed: { formula, inputs }` + `formulas` prop; recomputes on mount + input change; read-only unless `editable`; works per-row in arrays |
| Reactions (v2) | `effects: [{ when, set }]` on the triggering field — static value writes on change (never on mount); cycles rejected at dev time |
| Files | `type: "file"`, `accept`, `multiple` (value is `File`/`File[]`); `validation.maxSize`/`maxFiles`/`fileTypes`; drag-and-drop UI in both adapters |
| i18n | any string is a key resolved by the `t` prop |
| Styling | `className`, `classNames` slots, plus stable `.fr-*` classes + `data-field`/`data-type`/`data-invalid` |
| Custom fields | any `type` string + a component in the `components` map; `props` passthrough |

## How conditional + validation interact

Hidden fields are **excluded from validation and from submitted values** — a
required field that isn't visible never blocks submit. When a field becomes
hidden its value is unregistered. This is what makes "checkbox reveals fields"
work without separate arrays.

## Edit mode (prefilling values)

The same form renders create and edit. Both prefill props are **merged over the
schema's per-field defaults**, so partial objects are fine — keys just have to
match field `name`s.

| Prop | When it's read | Use for |
|---|---|---|
| `defaultValues` | **once, on mount** (RHF semantics) | create-mode prefill, or data already available at first render |
| `values` | **on mount and whenever it changes** | edit-mode prefill that's fetched async; re-syncs without remounting |

```tsx
// create — empty/default
<FormRender schema={schema} components={c} onSubmit={create} />

// edit — record already loaded
<FormRender schema={schema} components={c} defaultValues={record} onSubmit={update} />

// edit — record fetched async (syncs when it arrives; null/undefined while loading)
<FormRender schema={schema} components={c} values={data} onSubmit={update} />
```

With `values`, the form re-initialises when the object changes but **keeps fields
the user has already edited** (`keepDirtyValues`), so a background refetch updates
untouched fields without discarding in-progress edits. Pass a referentially
stable object (e.g. from your data layer); a new literal every render would
re-sync each time.

Two gotchas:

- **File fields can't be prefilled from a URL.** A stored attachment is a URL
  string, but the `file` field holds `File` objects — a URL default is ignored by
  the input. Show the existing file as a link outside the field and only set the
  field when the user picks a replacement.
- **Don't combine `persist` with edit mode.** The draft key is `schema.id` (not
  per-record), so a saved draft can override your prefill or leak between records.
  Leave `persist` off for edit forms.

### Drafts & schema versions (v2)

Persisted drafts are saved as `{ __v: schema.version, values }` (debounced) and
**cleared automatically after a successful submit**. A draft saved under a
different `schema.version` is discarded — unless you pass `migrateDraft` to
upgrade it:

```tsx
<FormRender
  schema={schemaV3}
  migrateDraft={(draft, savedVersion) =>
    savedVersion === 2 ? { ...draft, fullName: draft.name } : null /* discard */
  }
  …
/>
```

## Uploading files

A `file` field is **selection-only**: it holds `File` / `File[]` in form state
and Zod validates `maxSize`/`maxFiles`/`fileTypes` on those objects. Drag-and-drop
works out of the box in both adapters — dragging files just populates state.

**Option A — built-in upload-on-select (v2, recommended).** Name an uploader on
the field and inject the function; the engine uploads the moment a file is
picked, shows per-file progress (`uploads` prop in the file component), aborts
when a file is removed, **disables submit while uploads are in flight**, and
swaps `File → URL` in the payload before `onSubmit`:

```tsx
// schema: { "name": "attachments", "type": "file", "multiple": true, "upload": "s3" }
<FormRender
  schema={schema}
  components={htmlComponents}
  uploaders={{
    s3: async (file, { signal, onProgress }) => {
      const { uploadUrl, publicUrl } = await getPresignedUrl(file, { signal });
      await putWithProgress(uploadUrl, file, { signal, onProgress });
      return publicUrl; // ← what onSubmit receives instead of the File
    },
  }}
  onSubmit={saveToBackend}   // values.attachments is string[] of URLs
/>;
```

Zod still validates the real `File` objects (`maxSize`/`fileTypes`); only the
submitted payload carries URLs. Failed uploads block submit with a field error.

**Option B — upload in `onSubmit`.** When the user hits Save, upload
each file and swap the `File` for its URL before calling your backend:

```tsx
<FormRender
  schema={schema}
  components={htmlComponents}        // or shadcnComponents
  onSubmit={async (values) => {
    const out = { ...values };
    for (const [name, v] of Object.entries(values)) {
      if (v instanceof File) out[name] = await uploadToS3(v);
      else if (Array.isArray(v) && v[0] instanceof File)
        out[name] = await Promise.all(v.map(uploadToS3));
    }
    await saveToBackend(out);         // your API stores the URLs
  }}
/>;
```

Trade-off: no per-file progress until Save.

**Option C — fully custom.** For exotic flows (chunked uploads, resumable,
client-side encryption), inject your own `file` component via the `components`
map. The pattern: **form state keeps the `File` objects** (so Zod validation
still runs) while a `ref` keyed by file holds the upload result; `onSubmit`
swaps `File → URL` and gates on in-flight uploads:

```tsx
type Up = { status: "uploading" | "done" | "error"; progress: number; url?: string };
const keyOf = (f: File) => f.name + ":" + f.size + ":" + f.lastModified;

function makeS3FileField(store: React.MutableRefObject<Map<string, Up>>) {
  return function S3FileField(p: FieldComponentProps<File | File[] | undefined>) {
    const multiple = !!p.field.multiple;
    const files = Array.isArray(p.value) ? p.value : p.value ? [p.value] : [];
    const [, force] = React.useReducer((x) => x + 1, 0);

    const upload = async (f: File) => {
      const k = keyOf(f);
      store.current.set(k, { status: "uploading", progress: 0 }); force();
      try {
        const { uploadUrl, s3Url } = await getPresignedUrl(f);
        await uploadFileToS3(f, uploadUrl, (pct) => {
          store.current.set(k, { status: "uploading", progress: pct }); force();
        });
        store.current.set(k, { status: "done", progress: 100, url: s3Url });
      } catch { store.current.set(k, { status: "error", progress: 0 }); }
      force();
    };

    const addFiles = (incoming: File[]) => {
      if (p.disabled || !incoming.length) return;
      const next = multiple
        ? [...files, ...incoming.filter((f) => !files.some((m) => keyOf(m) === keyOf(f)))]
            .slice(0, p.field.validation?.maxFiles?.value ?? Infinity)
        : incoming.slice(0, 1);
      p.onChange(multiple ? next : next[0]); p.onBlur();
      for (const f of next) if (!store.current.has(keyOf(f))) upload(f);  // fire upload now
    };

    return (/* your dropzone (onDrop={addFiles}) + a bar from store.current.get(keyOf(f)) */);
  };
}

// wire it up + gate submit on in-flight uploads
const uploads = React.useRef(new Map<string, Up>());

<FormRender
  schema={schema}
  components={{ ...htmlComponents, file: makeS3FileField(uploads) }}
  onSubmit={async (values) => {
    const states = [...uploads.current.values()];
    if (states.some((s) => s.status === "uploading"))
      return { errors: { attachments: "Please wait for uploads to finish." } };
    if (states.some((s) => s.status === "error"))
      return { errors: { attachments: "Some uploads failed — remove and retry." } };

    const out = { ...values };
    for (const [name, v] of Object.entries(values)) {
      // only touch file fields — skip non-file arrays like multi-selects
      const files = v instanceof File ? [v] : Array.isArray(v) && v[0] instanceof File ? v : null;
      if (!files) continue;
      const urls = files.map((f) => uploads.current.get(keyOf(f))!.url!);
      out[name] = v instanceof File ? urls[0] : urls;
    }
    await saveToBackend(out);
  }}
/>;
```

> Storing URL *strings* in form state would fail validation — the `file` type
> asserts `instanceof File`. Keep `File` objects in state; keep URLs in the ref.

### Submitting to your API

A complete, runnable round-trip — file upload, `POST`, mapping a `422` to
field-level errors, the "Test Connection" action, and an async field validator
— lives in [`examples/submit.tsx`](examples/submit.tsx):

```tsx
export async function submitConnection(values: FormValues): Promise<SubmitResult | void> {
  const payload = await uploadFiles(values);              // Files → URLs first
  const res = await fetch("/api/connections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.status === 422)                                 // per-field server errors
    return { errors: (await res.json()).errors };
  if (!res.ok)
    return { errors: { host: "Could not reach the server. Please try again." } };
  // success → return nothing
}

<FormRender schema={schema} components={htmlComponents} onSubmit={submitConnection} />;
```

`onSubmit` only runs after client-side (Zod) validation passes, so `values` is
already well-formed. Return `{ errors }` to surface server errors on specific
fields; return nothing on success.

## Repeatable groups (v2)

```jsonc
{
  "name": "contacts", "type": "array", "label": "Contacts",
  "addText": "Add contact", "defaultItems": 1, "sortable": true,
  "item": {
    "fields": [
      { "name": "cname", "type": "text", "label": "Name",
        "validation": { "required": { "message": "Required" } } },
      { "name": "isPrimary", "type": "switch", "label": "Primary" },
      { "name": "notes", "type": "text",
        "visibleWhen": { "field": "isPrimary", "is": true } }   // row-relative
    ],
    "layout": [["cname", "isPrimary"], ["notes"]]
  },
  "validation": {
    "minItems": { "value": 1, "message": "Add at least one" },
    "maxItems": { "value": 5, "message": "Max 5" }
  }
}
```

Submitted value: `contacts: [{ cname, isPrimary, notes }, …]`. Conditions inside
rows address **row siblings** by bare name; prefix with `$.` to reference a
root-level field (`{ "field": "$.plan", "is": "pro" }`). Arrays nest up to 3
levels. The Add/Remove/Move controls render through two new injectable slots,
`ArrayField` and `ArrayItem` (default `fr-array*` markup; shadcn versions ship
in the template).

## Computed fields & reactions (v2)

Derived values live in the schema; the math is injected (so JSON stays serializable):

```jsonc
{ "name": "qty",   "type": "number", "default": 1 },
{ "name": "price", "type": "number", "default": 0 },
{ "name": "total", "type": "number",
  "computed": { "formula": "lineTotal", "inputs": ["qty", "price"] } }
```

```tsx
<FormRender
  schema={schema}
  formulas={{ lineTotal: ({ qty, price }) => (Number(qty) || 0) * (Number(price) || 0) }}
  …
/>
```

Computed fields derive on mount and whenever an input changes, render read-only
(pass `"editable": true` to allow manual overrides), and work **per row** inside
arrays — inputs use row-sibling names, `$.` reaches the root, and a whole array
can be an input (`"inputs": ["items", "taxRate"]` for a grand total). See
[`examples/invoice.ts`](examples/invoice.ts) for the full line-items + totals demo.

Reactions are declared on the field that triggers them — no code needed for
static writes:

```jsonc
{ "name": "country", "type": "select", "options": [...],
  "effects": [
    { "when": { "field": "country", "notEmpty": true }, "set": { "state": "" } },
    { "when": { "field": "country", "is": "US" }, "set": { "currency": "USD" } }
  ] }
```

Effects fire on change (never on mount). `validateSchema` rejects unknown
references and any computed/effects cycle.

## Roadmap

- **v2 (in progress):** ~~repeatable groups~~ ✅, ~~typed values (`InferValues`)~~ ✅,
  ~~computed fields + reactions~~ ✅, ~~async-validation-at-submit~~ ✅,
  ~~richer conditions + custom rules~~ ✅, ~~loader states~~ ✅, ~~versioned drafts +
  migrations~~ ✅, ~~polish pack (a11y, masks, tooltips, wizard upgrades, review
  steps)~~ ✅ — engine + polish complete (beta.2). Next: AI schema generation,
  JSON Schema publishing, playground v2, launch.
  See [docs/PRD-v2.md](docs/PRD-v2.md) and [docs/TASKS-v2.md](docs/TASKS-v2.md).

## License

MIT
