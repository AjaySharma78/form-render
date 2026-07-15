// @ts-nocheck — template: type-checks in YOUR app once @mui/material is installed.
/**
 * MUI (Material UI) adapter for schema-form-engine.
 *
 * Scaffold:  npx schema-form-engine add mui
 * Deps:      npm i @mui/material @emotion/react @emotion/styled
 *
 * Exports `muiComponents` (field controls) and `muiSlots` (Button + FieldWrapper).
 * Structural slots (Grid, Stepper, …) fall back to the engine defaults — style
 * them with .fr-* CSS or replace them with your own MUI layout.
 *
 *   <FormRender schema={schema} components={muiComponents} slots={muiSlots} onSubmit={save} />
 */
import { useState } from "react";
import { fileKey } from "schema-form-engine";
import type { ComponentMap, FieldComponentProps, FieldWrapperProps, ButtonSlotProps, FormSlots } from "schema-form-engine";

import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import FormLabel from "@mui/material/FormLabel";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Slider from "@mui/material/Slider";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";

const TEXT_LIKE = ["text", "email", "search", "tel", "url", "color", "date", "datetime-local", "month", "time", "week"] as const;

const common = (p: FieldComponentProps<any>) => ({
  id: p.id,
  fullWidth: true,
  size: "small" as const,
  error: !!p.error,
  disabled: p.disabled,
  onBlur: p.onBlur,
  placeholder: p.field.placeholder ? p.t(p.field.placeholder) : undefined,
  inputProps: { "aria-describedby": p.describedBy },
});

function MuiText(p: FieldComponentProps<string>) {
  return (
    <TextField
      {...common(p)}
      type={p.field.type}
      value={p.value ?? ""}
      onChange={(e) => p.onChange(e.target.value)}
    />
  );
}

function MuiPassword(p: FieldComponentProps<string>) {
  const [show, setShow] = useState(false);
  return (
    <TextField
      {...common(p)}
      type={show ? "text" : "password"}
      value={p.value ?? ""}
      onChange={(e) => p.onChange(e.target.value)}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <IconButton size="small" onClick={() => setShow((s) => !s)} edge="end">
              {show ? "🙈" : "👁"}
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  );
}

function MuiNumber(p: FieldComponentProps<number | "">) {
  return (
    <TextField
      {...common(p)}
      type="number"
      value={p.value ?? ""}
      onChange={(e) => p.onChange(e.target.value === "" ? "" : Number(e.target.value))}
      inputProps={{
        min: typeof p.field.min === "number" ? p.field.min : undefined,
        max: typeof p.field.max === "number" ? p.field.max : undefined,
        step: p.field.step,
        "aria-describedby": p.describedBy,
      }}
    />
  );
}

function MuiRange(p: FieldComponentProps<number>) {
  return (
    <Slider
      value={typeof p.value === "number" ? p.value : 0}
      min={typeof p.field.min === "number" ? p.field.min : 0}
      max={typeof p.field.max === "number" ? p.field.max : 100}
      step={p.field.step}
      disabled={p.disabled}
      onChange={(_, v) => p.onChange(v as number)}
      onChangeCommitted={p.onBlur}
    />
  );
}

function MuiTextArea(p: FieldComponentProps<string>) {
  return (
    <TextField
      {...common(p)}
      multiline
      minRows={p.field.rows ?? 4}
      value={p.value ?? ""}
      onChange={(e) => p.onChange(e.target.value)}
    />
  );
}

function MuiCheckbox(p: FieldComponentProps<boolean>) {
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

function MuiSwitch(p: FieldComponentProps<boolean>) {
  return (
    <Switch
      id={p.id}
      checked={!!p.value}
      disabled={p.disabled}
      onChange={(e) => p.onChange(e.target.checked)}
      onBlur={p.onBlur}
    />
  );
}

function MuiSelect(p: FieldComponentProps<string | number | (string | number)[]>) {
  const multiple = !!p.field.multiple || p.field.type === "multiselect";
  return (
    <TextField
      {...common(p)}
      select
      value={multiple ? (Array.isArray(p.value) ? p.value : []) : p.value ?? ""}
      SelectProps={{ multiple }}
      onChange={(e) => p.onChange(e.target.value as any)}
    >
      {(p.field.options ?? []).map((o) => (
        <MenuItem key={String(o.value)} value={o.value}>
          {p.t(o.label)}
        </MenuItem>
      ))}
    </TextField>
  );
}

function MuiRadio(p: FieldComponentProps<string | number>) {
  return (
    <RadioGroup
      row
      value={p.value ?? ""}
      onChange={(_, v) => {
        const match = (p.field.options ?? []).find((o) => String(o.value) === v);
        p.onChange(match ? match.value : v);
      }}
      onBlur={p.onBlur}
      aria-labelledby={`${p.id}-label`}
    >
      {(p.field.options ?? []).map((o, i) => (
        <FormControlLabel
          key={String(o.value)}
          value={o.value}
          control={<Radio id={i === 0 ? p.id : undefined} size="small" />}
          label={p.t(o.label)}
          disabled={p.disabled}
        />
      ))}
    </RadioGroup>
  );
}

/** Selection-only file input (native input; upload progress via p.uploads). */
function MuiFile(p: FieldComponentProps<File | File[] | undefined>) {
  const files = Array.isArray(p.value) ? p.value : p.value ? [p.value] : [];
  return (
    <div>
      <Button variant="outlined" component="label" size="small" disabled={p.disabled}>
        {p.field.placeholder ? p.t(p.field.placeholder) : "Choose file"}
        <input
          id={p.id}
          hidden
          type="file"
          accept={p.field.accept?.join(",")}
          multiple={!!p.field.multiple}
          onChange={(e) => {
            const list = Array.from(e.target.files ?? []);
            p.onChange(p.field.multiple ? [...files, ...list] : list[0]);
            p.onBlur();
            e.currentTarget.value = "";
          }}
        />
      </Button>
      <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1rem" }}>
        {files.map((f) => {
          const up = p.uploads?.[fileKey(f)];
          return (
            <li key={`${f.name}:${f.size}`} style={{ fontSize: "0.85rem" }}>
              {f.name}
              {up && (up.status === "uploading" ? ` — ${Math.round(up.progress)}%` : up.status === "done" ? " ✓" : " ✖")}
              <IconButton
                size="small"
                aria-label={`Remove ${f.name}`}
                onClick={() => {
                  const next = files.filter((x) => x !== f);
                  p.onChange(p.field.multiple ? next : undefined);
                  p.onBlur();
                }}
              >
                ×
              </IconButton>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MuiHidden(p: FieldComponentProps<string>) {
  return <input id={p.id} type="hidden" value={p.value ?? ""} readOnly />;
}

export const muiComponents: ComponentMap = {
  ...Object.fromEntries(TEXT_LIKE.map((t) => [t, MuiText])),
  password: MuiPassword,
  number: MuiNumber,
  range: MuiRange,
  textarea: MuiTextArea,
  checkbox: MuiCheckbox,
  switch: MuiSwitch,
  select: MuiSelect,
  multiselect: MuiSelect,
  radio: MuiRadio,
  file: MuiFile,
  hidden: MuiHidden,
} as ComponentMap;

// ── slots ──

const BUTTON_VARIANT = { primary: "contained", secondary: "outlined", outline: "text" } as const;

export function MuiButton({ variant, ...props }: ButtonSlotProps) {
  return <Button variant={BUTTON_VARIANT[variant]} size="small" {...props} />;
}

export function MuiFieldWrapper({
  field,
  id,
  label,
  description,
  tooltip,
  error,
  required,
  invalid,
  validating,
  descriptionId,
  errorId,
  children,
}: FieldWrapperProps) {
  return (
    <FormControl fullWidth error={invalid} required={required} aria-busy={validating || undefined}>
      {label && (
        <FormLabel htmlFor={id} id={`${id}-label`} sx={{ mb: 0.5, fontSize: "0.875rem" }}>
          {label}
          {tooltip && (
            <Tooltip title={tooltip}>
              <span style={{ marginLeft: 4, cursor: "help" }}>ⓘ</span>
            </Tooltip>
          )}
        </FormLabel>
      )}
      {children}
      {description && !error && <FormHelperText id={descriptionId}>{description}</FormHelperText>}
      {error && <FormHelperText id={errorId}>{error}</FormHelperText>}
    </FormControl>
  );
}

export const muiSlots: Partial<FormSlots> = {
  Button: MuiButton,
  FieldWrapper: MuiFieldWrapper,
};
