// @ts-nocheck — template: type-checks in YOUR app once antd is installed.
/**
 * Ant Design adapter for schema-form-engine.
 *
 * Scaffold:  npx schema-form-engine add antd
 * Deps:      npm i antd
 *
 * Exports `antdComponents` (field controls) and `antdSlots` (Button + FieldWrapper).
 * Structural slots (Grid, Stepper, …) fall back to the engine defaults — style
 * them with .fr-* CSS or replace them with antd layout components.
 *
 *   <FormRender schema={schema} components={antdComponents} slots={antdSlots} onSubmit={save} />
 */
import {
  Button,
  Checkbox,
  Input,
  InputNumber,
  Radio,
  Select,
  Slider,
  Switch,
  Tooltip,
  Typography,
  Upload,
} from "antd";
import { fileKey } from "schema-form-engine";
import type { ComponentMap, FieldComponentProps, FieldWrapperProps, ButtonSlotProps, FormSlots } from "schema-form-engine";

const TEXT_LIKE = ["text", "email", "search", "tel", "url", "color", "date", "datetime-local", "month", "time", "week"] as const;

function AntText(p: FieldComponentProps<string>) {
  return (
    <Input
      id={p.id}
      type={p.field.type}
      status={p.error ? "error" : undefined}
      value={p.value ?? ""}
      placeholder={p.field.placeholder ? p.t(p.field.placeholder) : undefined}
      disabled={p.disabled}
      readOnly={p.field.readOnly}
      aria-describedby={p.describedBy}
      onChange={(e) => p.onChange(e.target.value)}
      onBlur={p.onBlur}
    />
  );
}

function AntPassword(p: FieldComponentProps<string>) {
  return (
    <Input.Password
      id={p.id}
      status={p.error ? "error" : undefined}
      value={p.value ?? ""}
      placeholder={p.field.placeholder ? p.t(p.field.placeholder) : undefined}
      disabled={p.disabled}
      aria-describedby={p.describedBy}
      onChange={(e) => p.onChange(e.target.value)}
      onBlur={p.onBlur}
    />
  );
}

function AntNumber(p: FieldComponentProps<number | "">) {
  return (
    <InputNumber
      id={p.id}
      style={{ width: "100%" }}
      status={p.error ? "error" : undefined}
      value={p.value === "" || p.value === undefined ? null : p.value}
      min={typeof p.field.min === "number" ? p.field.min : undefined}
      max={typeof p.field.max === "number" ? p.field.max : undefined}
      step={p.field.step}
      disabled={p.disabled}
      aria-describedby={p.describedBy}
      onChange={(v) => p.onChange(v === null ? "" : (v as number))}
      onBlur={p.onBlur}
    />
  );
}

function AntRange(p: FieldComponentProps<number>) {
  return (
    <Slider
      id={p.id}
      value={typeof p.value === "number" ? p.value : 0}
      min={typeof p.field.min === "number" ? p.field.min : 0}
      max={typeof p.field.max === "number" ? p.field.max : 100}
      step={p.field.step}
      disabled={p.disabled}
      onChange={(v) => p.onChange(v as number)}
      onChangeComplete={p.onBlur}
    />
  );
}

function AntTextArea(p: FieldComponentProps<string>) {
  return (
    <Input.TextArea
      id={p.id}
      rows={p.field.rows ?? 4}
      status={p.error ? "error" : undefined}
      value={p.value ?? ""}
      placeholder={p.field.placeholder ? p.t(p.field.placeholder) : undefined}
      disabled={p.disabled}
      aria-describedby={p.describedBy}
      onChange={(e) => p.onChange(e.target.value)}
      onBlur={p.onBlur}
    />
  );
}

function AntCheckbox(p: FieldComponentProps<boolean>) {
  return (
    <Checkbox
      id={p.id}
      checked={!!p.value}
      disabled={p.disabled}
      onChange={(e) => p.onChange(e.target.checked)}
      onBlur={p.onBlur}
    />
  );
}

function AntSwitch(p: FieldComponentProps<boolean>) {
  return (
    <Switch
      id={p.id}
      checked={!!p.value}
      disabled={p.disabled}
      onChange={(v) => {
        p.onChange(v);
        p.onBlur();
      }}
    />
  );
}

function AntSelect(p: FieldComponentProps<string | number | (string | number)[]>) {
  const multiple = !!p.field.multiple || p.field.type === "multiselect";
  const loading = p.optionsState?.loading;
  return (
    <Select
      id={p.id}
      style={{ width: "100%" }}
      mode={multiple ? "multiple" : undefined}
      status={p.error ? "error" : undefined}
      loading={loading}
      allowClear={p.field.clearable}
      value={multiple ? (Array.isArray(p.value) ? p.value : []) : p.value === "" ? undefined : p.value}
      placeholder={p.field.placeholder ? p.t(p.field.placeholder) : undefined}
      disabled={p.disabled || loading}
      options={(p.field.options ?? []).map((o) => ({ value: o.value, label: p.t(o.label) }))}
      onChange={(v) => p.onChange(v ?? "")}
      onBlur={p.onBlur}
    />
  );
}

function AntRadio(p: FieldComponentProps<string | number>) {
  return (
    <Radio.Group
      id={p.id}
      value={p.value === "" ? undefined : p.value}
      disabled={p.disabled}
      onChange={(e) => p.onChange(e.target.value)}
      onBlur={p.onBlur}
      options={(p.field.options ?? []).map((o) => ({ value: o.value, label: p.t(o.label) }))}
    />
  );
}

/** Selection-only file input; engine uploads (Field.upload) show via p.uploads. */
function AntFile(p: FieldComponentProps<File | File[] | undefined>) {
  const files = Array.isArray(p.value) ? p.value : p.value ? [p.value] : [];
  return (
    <Upload
      multiple={!!p.field.multiple}
      accept={p.field.accept?.join(",")}
      fileList={files.map((f, i) => {
        const up = p.uploads?.[fileKey(f)];
        return {
          uid: String(i),
          name: f.name,
          status: up?.status === "error" ? "error" : up?.status === "uploading" ? "uploading" : "done",
          percent: up?.progress,
        };
      })}
      beforeUpload={(f) => {
        p.onChange(p.field.multiple ? [...files, f] : f);
        p.onBlur();
        return false; // never let antd upload — the engine (or onSubmit) does
      }}
      onRemove={(item) => {
        const next = files.filter((f) => f.name !== item.name);
        p.onChange(p.field.multiple ? next : undefined);
        p.onBlur();
      }}
      disabled={p.disabled}
    >
      <Button size="small" disabled={p.disabled}>
        {p.field.placeholder ? p.t(p.field.placeholder) : "Choose file"}
      </Button>
    </Upload>
  );
}

function AntHidden(p: FieldComponentProps<string>) {
  return <input id={p.id} type="hidden" value={p.value ?? ""} readOnly />;
}

export const antdComponents: ComponentMap = {
  ...Object.fromEntries(TEXT_LIKE.map((t) => [t, AntText])),
  password: AntPassword,
  number: AntNumber,
  range: AntRange,
  textarea: AntTextArea,
  checkbox: AntCheckbox,
  switch: AntSwitch,
  select: AntSelect,
  multiselect: AntSelect,
  radio: AntRadio,
  file: AntFile,
  hidden: AntHidden,
} as ComponentMap;

// ── slots ──

const BUTTON_TYPE = { primary: "primary", secondary: "default", outline: "dashed" } as const;

export function AntButton({ variant, type, ...props }: ButtonSlotProps) {
  return <Button htmlType={type} type={BUTTON_TYPE[variant]} {...props} />;
}

export function AntFieldWrapper({
  field,
  id,
  label,
  description,
  tooltip,
  error,
  required,
  validating,
  descriptionId,
  errorId,
  children,
}: FieldWrapperProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }} aria-busy={validating || undefined}>
      {label && (
        <label htmlFor={id} id={`${id}-label`} style={{ fontSize: "0.875rem", fontWeight: 500 }}>
          {label}
          {required && <span style={{ color: "#ff4d4f" }}> *</span>}
          {tooltip && (
            <Tooltip title={tooltip}>
              <span style={{ marginLeft: 4, cursor: "help" }}>ⓘ</span>
            </Tooltip>
          )}
        </label>
      )}
      {children}
      {description && !error && (
        <Typography.Text id={descriptionId} type="secondary" style={{ fontSize: "0.8rem" }}>
          {description}
        </Typography.Text>
      )}
      {error && (
        <Typography.Text id={errorId} type="danger" role="alert" style={{ fontSize: "0.8rem" }}>
          {error}
        </Typography.Text>
      )}
    </div>
  );
}

export const antdSlots: Partial<FormSlots> = {
  Button: AntButton,
  FieldWrapper: AntFieldWrapper,
};
