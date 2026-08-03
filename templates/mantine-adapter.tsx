// @ts-nocheck — template: type-checks in YOUR app once @mantine/core v8 is installed.
/**
 * Mantine v8 adapter for schema-form-engine.
 *
 * Scaffold:  npx schema-form-engine add mantine
 * Deps:      npm i @mantine/core@^8 @mantine/hooks@^8 @mantine/dates@^8 dayjs
 * Setup:     wrap your app in <MantineProvider> and import "@mantine/core/styles.css"
 *            (+ "@mantine/dates/styles.css") per Mantine's docs.
 *
 * Exports `mantineComponents` (field controls) and `mantineSlots` (Button,
 * FieldWrapper, Stepper, ArrayField, ArrayItem, Review). Grid/Cell fall back to
 * the engine defaults — style them with .fr-* CSS or replace them.
 *
 * Dates use @mantine/dates pickers. Mantine 8 speaks date STRINGS, so values
 * stay engine-compatible; datetime-local/month get a tiny format bridge (see
 * toEngineDateTime/fromEngineDateTime below).
 *
 * File field is a plain FileInput. Want drag-and-drop? Swap it for
 * @mantine/dropzone's <Dropzone> — keep the same onChange/uploads wiring.
 *
 *   <FormRender schema={schema} components={mantineComponents} slots={mantineSlots} onSubmit={save} />
 */
import { useState } from "react";
import { fileKey } from "schema-form-engine";
import type {
  ArrayFieldSlotProps,
  ArrayItemSlotProps,
  ButtonSlotProps,
  ComponentMap,
  FieldComponentProps,
  FieldWrapperProps,
  FormSlots,
  ReviewSlotProps,
  StepperSlotProps,
} from "schema-form-engine";

import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  FileInput,
  Group,
  Input,
  Loader,
  MultiSelect,
  NumberInput,
  PasswordInput,
  Progress,
  Radio,
  Select,
  Slider,
  Stack,
  Stepper,
  Switch,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { DateInput, DateTimePicker, MonthPickerInput, TimeInput } from "@mantine/dates";

/** plain text-ish types TextInput covers directly */
const TEXT_LIKE = ["text", "email", "search", "tel", "url", "color", "week"] as const;

const common = (p: FieldComponentProps<any>) => ({
  id: p.id,
  disabled: p.disabled,
  error: !!p.error, // message renders in the wrapper; keep Mantine's invalid styling
  placeholder: p.field.placeholder ? p.t(p.field.placeholder) : undefined,
  "aria-describedby": p.describedBy,
});

function MantineText(p: FieldComponentProps<string>) {
  return (
    <TextInput
      {...common(p)}
      type={p.field.type === "text" ? undefined : p.field.type}
      value={p.value ?? ""}
      onChange={(e) => p.onChange(e.currentTarget.value)}
      onBlur={p.onBlur}
    />
  );
}

function MantinePassword(p: FieldComponentProps<string>) {
  return (
    <PasswordInput
      {...common(p)}
      value={p.value ?? ""}
      onChange={(e) => p.onChange(e.currentTarget.value)}
      onBlur={p.onBlur}
    />
  );
}

function MantineNumber(p: FieldComponentProps<number | "">) {
  return (
    <NumberInput
      {...common(p)}
      value={p.value ?? ""}
      min={typeof p.field.min === "number" ? p.field.min : undefined}
      max={typeof p.field.max === "number" ? p.field.max : undefined}
      step={p.field.step}
      onChange={(v) => p.onChange(v === "" || v === null ? "" : Number(v))}
      onBlur={p.onBlur}
    />
  );
}

function MantineRange(p: FieldComponentProps<number>) {
  const min = typeof p.field.min === "number" ? p.field.min : 0;
  const max = typeof p.field.max === "number" ? p.field.max : 100;
  return (
    <Slider
      value={typeof p.value === "number" ? p.value : min}
      min={min}
      max={max}
      step={p.field.step}
      disabled={p.disabled}
      onChange={(v) => p.onChange(v)}
      onChangeEnd={() => p.onBlur()}
      aria-describedby={p.describedBy}
    />
  );
}

function MantineTextarea(p: FieldComponentProps<string>) {
  return (
    <Textarea
      {...common(p)}
      rows={p.field.rows ?? 4}
      value={p.value ?? ""}
      onChange={(e) => p.onChange(e.currentTarget.value)}
      onBlur={p.onBlur}
    />
  );
}

function MantineCheckbox(p: FieldComponentProps<boolean>) {
  return (
    <Checkbox
      id={p.id}
      checked={!!p.value}
      disabled={p.disabled}
      aria-describedby={p.describedBy}
      onChange={(e) => {
        p.onChange(e.currentTarget.checked);
        p.onBlur();
      }}
    />
  );
}

function MantineSwitch(p: FieldComponentProps<boolean>) {
  return (
    <Switch
      id={p.id}
      checked={!!p.value}
      disabled={p.disabled}
      aria-describedby={p.describedBy}
      onChange={(e) => {
        p.onChange(e.currentTarget.checked);
        p.onBlur();
      }}
    />
  );
}

/**
 * Select — Mantine data wants strings, so option values are bridged through
 * String() on the way in and mapped BACK to the original (possibly numeric)
 * option value on the way out.
 */
function MantineSelect(p: FieldComponentProps<string | number>) {
  const options = p.optionsState?.options ?? p.field.options ?? [];
  const loading = p.optionsState?.loading;
  return (
    <Select
      {...common(p)}
      data={options.map((o) => ({ value: String(o.value), label: p.t(o.label) }))}
      value={p.value === undefined || p.value === null || p.value === "" ? null : String(p.value)}
      disabled={p.disabled || loading}
      rightSection={loading ? <Loader size="xs" /> : undefined}
      clearable={!!p.field.clearable}
      onChange={(v) => {
        if (v === null) return p.onChange("");
        const match = options.find((o) => String(o.value) === v);
        p.onChange(match ? match.value : v);
      }}
      onBlur={p.onBlur}
    />
  );
}

function MantineMultiSelect(p: FieldComponentProps<(string | number)[]>) {
  const options = p.optionsState?.options ?? p.field.options ?? [];
  const values = Array.isArray(p.value) ? p.value : [];
  return (
    <MultiSelect
      {...common(p)}
      data={options.map((o) => ({ value: String(o.value), label: p.t(o.label) }))}
      value={values.map((v) => String(v))}
      disabled={p.disabled || p.optionsState?.loading}
      onChange={(vals) =>
        p.onChange(vals.map((v) => {
          const match = options.find((o) => String(o.value) === v);
          return match ? match.value : v;
        }))
      }
      onBlur={p.onBlur}
    />
  );
}

function MantineRadio(p: FieldComponentProps<string | number>) {
  const options = p.optionsState?.options ?? p.field.options ?? [];
  return (
    <Radio.Group
      value={p.value === undefined || p.value === null ? "" : String(p.value)}
      onChange={(v) => {
        const match = options.find((o) => String(o.value) === v);
        p.onChange(match ? match.value : v);
        p.onBlur();
      }}
      aria-labelledby={`${p.id}-label`}
    >
      <Group gap="md" mt="4">
        {options.map((o, i) => (
          <Radio
            key={String(o.value)}
            id={i === 0 ? p.id : undefined}
            value={String(o.value)}
            label={p.t(o.label)}
            disabled={p.disabled}
          />
        ))}
      </Group>
    </Radio.Group>
  );
}

// Mantine 8 date values are strings — bridge the two formats that differ from
// the native-input values the engine's zod compile expects.
const toEngineDateTime = (v: string | null) => (v ? v.replace(" ", "T").slice(0, 16) : "");
const fromEngineDateTime = (v: string | undefined) => (v ? v.replace("T", " ") : null);

function MantineDate(p: FieldComponentProps<string>) {
  return (
    <DateInput
      {...common(p)}
      value={p.value || null}
      onChange={(v) => p.onChange(v ?? "")}
      onBlur={p.onBlur}
      valueFormat="YYYY-MM-DD"
    />
  );
}

function MantineDateTime(p: FieldComponentProps<string>) {
  return (
    <DateTimePicker
      {...common(p)}
      value={fromEngineDateTime(p.value)}
      onChange={(v) => p.onChange(toEngineDateTime(v))}
      onBlur={p.onBlur}
    />
  );
}

function MantineMonth(p: FieldComponentProps<string>) {
  return (
    <MonthPickerInput
      {...common(p)}
      value={p.value ? `${p.value}-01` : null}
      onChange={(v) => p.onChange(v ? v.slice(0, 7) : "")}
      onBlur={p.onBlur}
    />
  );
}

function MantineTime(p: FieldComponentProps<string>) {
  return (
    <TimeInput
      {...common(p)}
      value={p.value ?? ""}
      onChange={(e) => p.onChange(e.currentTarget.value)}
      onBlur={p.onBlur}
    />
  );
}

/** Selection-only file input; upload progress renders from p.uploads. */
function MantineFile(p: FieldComponentProps<File | File[] | undefined>) {
  const files = Array.isArray(p.value) ? p.value : p.value ? [p.value] : [];
  return (
    <Box>
      <FileInput
        {...common(p)}
        multiple={!!p.field.multiple as any}
        accept={p.field.accept?.join(",")}
        value={(p.field.multiple ? files : files[0] ?? null) as any}
        onChange={(v: File | File[] | null) => {
          p.onChange(v === null ? undefined : v);
          p.onBlur();
        }}
        clearable
      />
      <Stack gap="4" mt="xs">
        {files.map((f) => {
          const up = p.uploads?.[fileKey(f)];
          if (!up) return null;
          return (
            <Group key={`${f.name}:${f.size}`} gap="xs">
              <Text size="sm" style={{ flex: 1 }} truncate="end">
                {f.name}
              </Text>
              {up.status === "uploading" && <Progress value={up.progress} w={96} size="xs" />}
              {up.status === "done" && <Text c="green" size="sm">✓</Text>}
              {up.status === "error" && <Text c="red" size="sm">upload failed</Text>}
            </Group>
          );
        })}
      </Stack>
    </Box>
  );
}

function MantineHidden(p: FieldComponentProps<string>) {
  return <input id={p.id} type="hidden" value={p.value ?? ""} readOnly />;
}

export const mantineComponents: ComponentMap = {
  ...Object.fromEntries(TEXT_LIKE.map((t) => [t, MantineText])),
  password: MantinePassword,
  number: MantineNumber,
  range: MantineRange,
  textarea: MantineTextarea,
  checkbox: MantineCheckbox,
  switch: MantineSwitch,
  select: MantineSelect,
  multiselect: MantineMultiSelect,
  radio: MantineRadio,
  date: MantineDate,
  "datetime-local": MantineDateTime,
  month: MantineMonth,
  time: MantineTime,
  file: MantineFile,
  hidden: MantineHidden,
} as ComponentMap;

// ─────────────────────────────── slots ─────────────────────────────────

const BUTTON_VARIANT = { primary: "filled", secondary: "light", outline: "outline" } as const;

export function MantineButton({ variant, ...props }: ButtonSlotProps) {
  return <Button variant={BUTTON_VARIANT[variant]} size="sm" {...props} />;
}

export function MantineFieldWrapper({
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
    <Input.Wrapper
      label={
        label && (
          <>
            {label}
            {tooltip && (
              <Tooltip label={tooltip}>
                <Text component="span" c="dimmed" ms="4" style={{ cursor: "help" }}>
                  ⓘ
                </Text>
              </Tooltip>
            )}
            {validating && <Loader size="xs" ml="4" />}
          </>
        )
      }
      withAsterisk={required}
      labelProps={{ htmlFor: id, id: `${id}-label` }}
      description={description}
      descriptionProps={{ id: descriptionId }}
      error={error}
      errorProps={{ id: errorId, role: "alert" }}
      aria-busy={validating || undefined}
    >
      {children}
    </Input.Wrapper>
  );
}

/** Mantine Stepper — visited steps clickable when onStepClick is provided. */
export function MantineStepper({ steps, current, onStepClick }: StepperSlotProps) {
  return (
    <Stepper
      active={current}
      size="sm"
      mb="md"
      onStepClick={(i) => {
        if (onStepClick && steps[i]?.visited && i !== current) onStepClick(i);
      }}
    >
      {steps.map((s) => (
        <Stepper.Step key={s.id} label={s.title} allowStepSelect={!!onStepClick && s.visited} />
      ))}
    </Stepper>
  );
}

export function MantineArrayField({ label, description, error, onAdd, addLabel, children }: ArrayFieldSlotProps) {
  return (
    <Box>
      {label && (
        <Text fw={500} size="sm" mb="4">
          {label}
        </Text>
      )}
      {description && (
        <Text size="sm" c="dimmed" mb="xs">
          {description}
        </Text>
      )}
      <Stack gap="sm">{children}</Stack>
      {error && (
        <Text role="alert" size="sm" c="red" mt="4">
          {error}
        </Text>
      )}
      {onAdd && (
        <Button variant="light" size="xs" mt="xs" onClick={onAdd}>
          + {addLabel}
        </Button>
      )}
    </Box>
  );
}

export function MantineArrayItem({ index, onRemove, removeLabel, onMoveUp, onMoveDown, children }: ArrayItemSlotProps) {
  return (
    <Box p="sm" style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: "var(--mantine-radius-md)" }}>
      <Group justify="space-between" mb="xs">
        <Text size="xs" c="dimmed">
          #{index + 1}
        </Text>
        <Group gap="4">
          {onMoveUp && (
            <ActionIcon variant="subtle" size="sm" aria-label="Move up" onClick={onMoveUp}>
              ↑
            </ActionIcon>
          )}
          {onMoveDown && (
            <ActionIcon variant="subtle" size="sm" aria-label="Move down" onClick={onMoveDown}>
              ↓
            </ActionIcon>
          )}
          {onRemove && (
            <ActionIcon variant="subtle" size="sm" aria-label={removeLabel} onClick={onRemove}>
              ×
            </ActionIcon>
          )}
        </Group>
      </Group>
      {children}
    </Box>
  );
}

export function MantineReview({ groups, onEdit, editLabel }: ReviewSlotProps) {
  return (
    <Stack gap="md">
      {groups.map((g) => (
        <Box key={g.id} p="md" style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: "var(--mantine-radius-md)" }}>
          <Group justify="space-between" mb="xs">
            <Text fw={500}>{g.title}</Text>
            <Button variant="subtle" size="xs" onClick={() => onEdit(g.index)}>
              {editLabel}
            </Button>
          </Group>
          <Stack gap="4">
            {g.items.map((it) => (
              <Group key={it.name} gap="md" align="start">
                <Text size="sm" c="dimmed" w={160}>
                  {it.label}
                </Text>
                <Text size="sm">{formatReviewValue(it.value)}</Text>
              </Group>
            ))}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

function formatReviewValue(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof File !== "undefined" && v instanceof File) return v.name;
  if (Array.isArray(v)) return v.map(formatReviewValue).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export const mantineSlots: Partial<FormSlots> = {
  Button: MantineButton,
  FieldWrapper: MantineFieldWrapper,
  Stepper: MantineStepper,
  ArrayField: MantineArrayField,
  ArrayItem: MantineArrayItem,
  Review: MantineReview,
};
