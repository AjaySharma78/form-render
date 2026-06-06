/**
 * Default unstyled adapter — plain HTML controls with `fr-*` class hooks.
 * Works out of the box and serves as the reference implementation of the
 * component contract. For shadcn, copy templates/shadcn-adapter.tsx into your
 * app (it imports your own @/components/ui/*).
 */
import { useState, type ChangeEvent } from "react";
import type { ComponentMap, FieldComponentProps } from "../types";
import { cn } from "../utils/cn";

const TEXT_LIKE = [
  "text",
  "email",
  "search",
  "tel",
  "url",
  "color",
  "date",
  "datetime-local",
  "month",
  "time",
  "week",
] as const;

function ctrlClass(p: FieldComponentProps<any>): string {
  return cn("fr-control", p.field.className, p.field.classNames?.control);
}

function TextInput(p: FieldComponentProps<string>) {
  const { field, t } = p;
  const input = (
    <input
      id={p.id}
      type={field.type === "color" ? "color" : field.type}
      className={ctrlClass(p)}
      value={p.value ?? ""}
      placeholder={field.placeholder ? t(field.placeholder) : undefined}
      disabled={p.disabled}
      readOnly={field.readOnly}
      step={field.step}
      min={typeof field.min === "string" ? field.min : undefined}
      max={typeof field.max === "string" ? field.max : undefined}
      onChange={(e: ChangeEvent<HTMLInputElement>) => p.onChange(e.target.value)}
      onBlur={p.onBlur}
    />
  );
  if (!field.prefix && !field.suffix) return input;
  return (
    <span className="fr-addon-group">
      {field.prefix && <span className="fr-addon fr-prefix">{t(field.prefix)}</span>}
      {input}
      {field.suffix && <span className="fr-addon fr-suffix">{t(field.suffix)}</span>}
    </span>
  );
}

/** Password input with a built-in show/hide toggle (dependency-free). */
function PasswordInput(p: FieldComponentProps<string>) {
  const { field, t } = p;
  const [visible, setVisible] = useState(false);
  return (
    <span className="fr-password">
      <input
        id={p.id}
        type={visible ? "text" : "password"}
        className={ctrlClass(p)}
        value={p.value ?? ""}
        placeholder={field.placeholder ? t(field.placeholder) : undefined}
        disabled={p.disabled}
        readOnly={field.readOnly}
        onChange={(e: ChangeEvent<HTMLInputElement>) => p.onChange(e.target.value)}
        onBlur={p.onBlur}
      />
      <button
        type="button"
        className="fr-password-toggle"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        disabled={p.disabled}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? "Hide" : "Show"}
      </button>
    </span>
  );
}

function NumberInput(p: FieldComponentProps<number | "">) {
  const { field } = p;
  return (
    <input
      id={p.id}
      type={field.type === "range" ? "range" : "number"}
      className={ctrlClass(p as FieldComponentProps)}
      value={p.value ?? ""}
      placeholder={field.placeholder ? p.t(field.placeholder) : undefined}
      disabled={p.disabled}
      readOnly={field.readOnly}
      step={field.step}
      min={typeof field.min === "number" ? field.min : undefined}
      max={typeof field.max === "number" ? field.max : undefined}
      onChange={(e) => p.onChange(e.target.value === "" ? "" : Number(e.target.value))}
      onBlur={p.onBlur}
    />
  );
}

function TextArea(p: FieldComponentProps<string>) {
  const { field } = p;
  return (
    <textarea
      id={p.id}
      className={ctrlClass(p as FieldComponentProps)}
      rows={field.rows ?? 4}
      value={p.value ?? ""}
      placeholder={field.placeholder ? p.t(field.placeholder) : undefined}
      disabled={p.disabled}
      readOnly={field.readOnly}
      onChange={(e) => p.onChange(e.target.value)}
      onBlur={p.onBlur}
    />
  );
}

function CheckboxInput(p: FieldComponentProps<boolean>) {
  return (
    <input
      id={p.id}
      type="checkbox"
      className={cn("fr-control fr-checkbox", p.field.className)}
      checked={!!p.value}
      disabled={p.disabled}
      onChange={(e) => p.onChange(e.target.checked)}
      onBlur={p.onBlur}
    />
  );
}

function SelectInput(p: FieldComponentProps<string | number>) {
  const { field, t } = p;
  return (
    <select
      id={p.id}
      className={ctrlClass(p as FieldComponentProps)}
      value={p.value ?? ""}
      disabled={p.disabled}
      onChange={(e) => p.onChange(e.target.value)}
      onBlur={p.onBlur}
    >
      {(field.placeholder || field.clearable) && (
        <option value="">{field.placeholder ? t(field.placeholder) : "—"}</option>
      )}
      {(field.options ?? []).map((o) => (
        <option key={String(o.value)} value={o.value}>
          {t(o.label)}
        </option>
      ))}
    </select>
  );
}

function MultiSelectInput(p: FieldComponentProps<(string | number)[]>) {
  const { field, t } = p;
  return (
    <select
      id={p.id}
      multiple
      className={ctrlClass(p as FieldComponentProps)}
      value={(p.value ?? []).map(String)}
      disabled={p.disabled}
      onChange={(e) => p.onChange(Array.from(e.target.selectedOptions, (o) => o.value))}
      onBlur={p.onBlur}
    >
      {(field.options ?? []).map((o) => (
        <option key={String(o.value)} value={o.value}>
          {t(o.label)}
        </option>
      ))}
    </select>
  );
}

// `select` renders single or multiple based on the `multiple` flag.
function SelectDispatch(p: FieldComponentProps<string | (string | number)[]>) {
  return p.field.multiple ? (
    <MultiSelectInput {...(p as FieldComponentProps<(string | number)[]>)} />
  ) : (
    <SelectInput {...(p as FieldComponentProps<string | number>)} />
  );
}

function RadioGroup(p: FieldComponentProps<string | number>) {
  const { field, t } = p;
  return (
    <div className={cn("fr-control fr-radio-group", field.className)} role="radiogroup">
      {(field.options ?? []).map((o) => (
        <label key={String(o.value)} className="fr-radio-option">
          <input
            type="radio"
            name={field.name}
            value={o.value}
            checked={p.value === o.value}
            disabled={p.disabled}
            onChange={() => p.onChange(o.value)}
            onBlur={p.onBlur}
          />
          {t(o.label)}
        </label>
      ))}
    </div>
  );
}

/**
 * File field. Selection only — holds File objects in form state; uploading is
 * the consumer's job at submit time. Stays dependency-free (no react-dropzone):
 * a native input for click/keyboard + a drop target on the wrapper, with a
 * removable list of the selected files.
 *
 * - `field.multiple`            → single (replace) vs. multiple (append) selection
 * - `field.validation.maxFiles` → file-count cap (multiple only)
 */
function FileInput(p: FieldComponentProps<File | File[] | undefined>) {
  const { field } = p;
  const multiple = !!field.multiple;
  const maxFiles = multiple ? field.validation?.maxFiles?.value ?? Infinity : 1;
  // real File objects only — guards against non-File values from a restored
  // draft (persisted Files JSON-serialize to {}, which would render as junk).
  const isFile = (v: unknown): v is File => typeof File !== "undefined" && v instanceof File;
  const raw = Array.isArray(p.value) ? p.value : p.value ? [p.value] : [];
  const files: File[] = raw.filter(isFile);

  const commit = (next: File[]) => {
    p.onChange(multiple ? next : next[0]);
    p.onBlur();
  };
  const addFiles = (incoming: File[]) => {
    if (!incoming.length || p.disabled) return;
    if (!multiple) return commit(incoming.slice(0, 1));
    // append + dedupe by name:size, respecting the file-count cap
    const merged = [...files];
    for (const f of incoming) {
      if (!merged.some((m) => m.name === f.name && m.size === f.size)) merged.push(f);
    }
    commit(merged.slice(0, maxFiles));
  };
  const removeFile = (name: string, size: number) => {
    const next = files.filter((f) => !(f.name === name && f.size === size));
    p.onChange(multiple ? (next.length ? next : undefined) : undefined);
    p.onBlur();
  };

  return (
    <div
      className="fr-file"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        addFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <input
        id={p.id}
        type="file"
        className={ctrlClass(p as FieldComponentProps)}
        accept={field.accept?.join(",")}
        multiple={multiple}
        disabled={p.disabled}
        onChange={(e) => {
          addFiles(Array.from(e.target.files ?? []));
          e.currentTarget.value = ""; // allow re-selecting the same file / managing our own list
        }}
        onBlur={p.onBlur}
      />
      {files.length > 0 && (
        <ul className="fr-file-list">
          {files.map((f) => (
            <li key={`${f.name}:${f.size}`} className="fr-file-item">
              <span className="fr-file-name">{f.name}</span>
              <span className="fr-file-size">{(f.size / 1024).toFixed(1)} KB</span>
              <button
                type="button"
                className="fr-file-remove"
                aria-label={`Remove ${f.name}`}
                disabled={p.disabled}
                onClick={() => removeFile(f.name, f.size)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HiddenInput(p: FieldComponentProps<string>) {
  return <input id={p.id} type="hidden" value={p.value ?? ""} readOnly />;
}

export const htmlComponents: ComponentMap = {
  ...Object.fromEntries(TEXT_LIKE.map((t) => [t, TextInput])),
  password: PasswordInput,
  number: NumberInput,
  range: NumberInput,
  textarea: TextArea,
  checkbox: CheckboxInput,
  switch: CheckboxInput,
  select: SelectDispatch,
  multiselect: MultiSelectInput,
  radio: RadioGroup,
  file: FileInput,
  hidden: HiddenInput,
} as ComponentMap;
