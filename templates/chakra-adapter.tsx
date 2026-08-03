// @ts-nocheck — template: type-checks in YOUR app once @chakra-ui/react v3 is installed.
/**
 * Chakra UI v3 adapter for schema-form-engine.
 *
 * Scaffold:  npx schema-form-engine add chakra
 * Deps:      npm i @chakra-ui/react @emotion/react     (Chakra v3 — the composable API)
 * Setup:     wrap your app in <ChakraProvider value={defaultSystem}> per Chakra's docs.
 *
 * Exports `chakraComponents` (field controls) and `chakraSlots` (Button,
 * FieldWrapper, Stepper, ArrayField, ArrayItem, Review). Grid/Cell fall back
 * to the engine defaults — style them with .fr-* CSS or replace them.
 *
 * Dates: Chakra v3 ships no date picker, so date/datetime-local/month/time/week
 * render as Chakra-styled NATIVE inputs (correct values, browser UI). Want a
 * popover calendar? Swap in a community picker (e.g. react-day-picker — see the
 * shadcn template's DateField for the wiring pattern) inside DateText below.
 *
 *   <FormRender schema={schema} components={chakraComponents} slots={chakraSlots} onSubmit={save} />
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
  Box,
  Button,
  CheckboxControl,
  CheckboxHiddenInput,
  CheckboxLabel,
  CheckboxRoot,
  FieldErrorText,
  FieldHelperText,
  FieldLabel,
  FieldRequiredIndicator,
  FieldRoot,
  HStack,
  IconButton,
  Input,
  NativeSelectField,
  NativeSelectIndicator,
  NativeSelectRoot,
  ProgressRange,
  ProgressRoot,
  ProgressTrack,
  RadioGroupItem,
  RadioGroupItemControl,
  RadioGroupItemHiddenInput,
  RadioGroupItemText,
  RadioGroupRoot,
  Separator,
  SliderControl,
  SliderHiddenInput,
  SliderRange,
  SliderRoot,
  SliderThumb,
  SliderTrack,
  Spinner,
  Stack,
  SwitchControl,
  SwitchHiddenInput,
  SwitchRoot,
  SwitchThumb,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";

/** native-input types Chakra styles directly (includes the date family — see header) */
const TEXT_LIKE = [
  "text", "email", "search", "tel", "url", "color",
  "date", "datetime-local", "month", "time", "week",
] as const;

const describedBy = (p: FieldComponentProps<any>) => ({ "aria-describedby": p.describedBy });

function ChakraText(p: FieldComponentProps<string>) {
  return (
    <Input
      id={p.id}
      type={p.field.type}
      value={p.value ?? ""}
      onChange={(e) => p.onChange(e.target.value)}
      onBlur={p.onBlur}
      disabled={p.disabled}
      placeholder={p.field.placeholder ? p.t(p.field.placeholder) : undefined}
      {...describedBy(p)}
    />
  );
}

function ChakraPassword(p: FieldComponentProps<string>) {
  const [show, setShow] = useState(false);
  return (
    <HStack gap="2">
      <Input
        id={p.id}
        type={show ? "text" : "password"}
        value={p.value ?? ""}
        onChange={(e) => p.onChange(e.target.value)}
        onBlur={p.onBlur}
        disabled={p.disabled}
        placeholder={p.field.placeholder ? p.t(p.field.placeholder) : undefined}
        {...describedBy(p)}
      />
      <IconButton
        aria-label={show ? "Hide password" : "Show password"}
        variant="ghost"
        size="sm"
        onClick={() => setShow((s) => !s)}
      >
        {show ? "🙈" : "👁"}
      </IconButton>
    </HStack>
  );
}

function ChakraNumber(p: FieldComponentProps<number | "">) {
  return (
    <Input
      id={p.id}
      type="number"
      value={p.value ?? ""}
      min={typeof p.field.min === "number" ? p.field.min : undefined}
      max={typeof p.field.max === "number" ? p.field.max : undefined}
      step={p.field.step}
      onChange={(e) => p.onChange(e.target.value === "" ? "" : Number(e.target.value))}
      onBlur={p.onBlur}
      disabled={p.disabled}
      {...describedBy(p)}
    />
  );
}

function ChakraRange(p: FieldComponentProps<number>) {
  const min = typeof p.field.min === "number" ? p.field.min : 0;
  const max = typeof p.field.max === "number" ? p.field.max : 100;
  return (
    <SliderRoot
      value={[typeof p.value === "number" ? p.value : min]}
      min={min}
      max={max}
      step={p.field.step}
      disabled={p.disabled}
      onValueChange={(e) => p.onChange(e.value[0])}
      onValueChangeEnd={() => p.onBlur()}
    >
      <SliderHiddenInput id={p.id} />
      <SliderControl>
        <SliderTrack>
          <SliderRange />
        </SliderTrack>
        <SliderThumb index={0} />
      </SliderControl>
    </SliderRoot>
  );
}

function ChakraTextarea(p: FieldComponentProps<string>) {
  return (
    <Textarea
      id={p.id}
      rows={p.field.rows ?? 4}
      value={p.value ?? ""}
      onChange={(e) => p.onChange(e.target.value)}
      onBlur={p.onBlur}
      disabled={p.disabled}
      placeholder={p.field.placeholder ? p.t(p.field.placeholder) : undefined}
      {...describedBy(p)}
    />
  );
}

function ChakraCheckbox(p: FieldComponentProps<boolean>) {
  return (
    <CheckboxRoot
      checked={!!p.value}
      disabled={p.disabled}
      onCheckedChange={(e) => {
        p.onChange(e.checked === true);
        p.onBlur();
      }}
    >
      <CheckboxHiddenInput id={p.id} aria-describedby={p.describedBy} />
      <CheckboxControl />
    </CheckboxRoot>
  );
}

function ChakraSwitch(p: FieldComponentProps<boolean>) {
  return (
    <SwitchRoot
      checked={!!p.value}
      disabled={p.disabled}
      onCheckedChange={(e) => {
        p.onChange(e.checked);
        p.onBlur();
      }}
    >
      <SwitchHiddenInput id={p.id} aria-describedby={p.describedBy} />
      <SwitchControl>
        <SwitchThumb />
      </SwitchControl>
    </SwitchRoot>
  );
}

/**
 * Single select — Chakra-styled native <select>. Option values keep their
 * type: the string from the DOM is mapped back to the original option value
 * (numeric options round-trip as numbers).
 */
function ChakraSelect(p: FieldComponentProps<string | number>) {
  const options = p.optionsState?.options ?? p.field.options ?? [];
  const loading = p.optionsState?.loading;
  return (
    <NativeSelectRoot disabled={p.disabled || loading} size="md">
      <NativeSelectField
        id={p.id}
        value={p.value === undefined || p.value === null ? "" : String(p.value)}
        onChange={(e) => {
          const match = options.find((o) => String(o.value) === e.target.value);
          p.onChange(match ? match.value : e.target.value);
        }}
        onBlur={p.onBlur}
        aria-describedby={p.describedBy}
      >
        <option value="">{loading ? "Loading…" : (p.field.placeholder ? p.t(p.field.placeholder) : "")}</option>
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {p.t(o.label)}
          </option>
        ))}
      </NativeSelectField>
      <NativeSelectIndicator />
    </NativeSelectRoot>
  );
}

/** multiselect — checkbox list (original option value types preserved) */
function ChakraMultiSelect(p: FieldComponentProps<(string | number)[]>) {
  const options = p.optionsState?.options ?? p.field.options ?? [];
  const values = Array.isArray(p.value) ? p.value : [];
  const toggle = (v: string | number) => {
    const next = values.includes(v) ? values.filter((x) => x !== v) : [...values, v];
    p.onChange(next);
    p.onBlur();
  };
  return (
    <VStack align="start" gap="1.5" aria-describedby={p.describedBy}>
      {p.optionsState?.loading && <Spinner size="sm" />}
      {options.map((o, i) => (
        <CheckboxRoot
          key={String(o.value)}
          checked={values.includes(o.value)}
          disabled={p.disabled}
          onCheckedChange={() => toggle(o.value)}
        >
          <CheckboxHiddenInput id={i === 0 ? p.id : undefined} />
          <CheckboxControl />
          <CheckboxLabel>{p.t(o.label)}</CheckboxLabel>
        </CheckboxRoot>
      ))}
    </VStack>
  );
}

function ChakraRadio(p: FieldComponentProps<string | number>) {
  const options = p.optionsState?.options ?? p.field.options ?? [];
  return (
    <RadioGroupRoot
      value={p.value === undefined || p.value === null ? null : String(p.value)}
      disabled={p.disabled}
      onValueChange={(e) => {
        const match = options.find((o) => String(o.value) === e.value);
        p.onChange(match ? match.value : (e.value ?? ""));
        p.onBlur();
      }}
      aria-labelledby={`${p.id}-label`}
    >
      <HStack gap="4" wrap="wrap">
        {options.map((o, i) => (
          <RadioGroupItem key={String(o.value)} value={String(o.value)}>
            <RadioGroupItemHiddenInput id={i === 0 ? p.id : undefined} />
            <RadioGroupItemControl />
            <RadioGroupItemText>{p.t(o.label)}</RadioGroupItemText>
          </RadioGroupItem>
        ))}
      </HStack>
    </RadioGroupRoot>
  );
}

/** Selection-only file input; upload progress renders from p.uploads. */
function ChakraFile(p: FieldComponentProps<File | File[] | undefined>) {
  const files = Array.isArray(p.value) ? p.value : p.value ? [p.value] : [];
  return (
    <Box>
      <Button asChild variant="outline" size="sm" disabled={p.disabled}>
        <label>
          {p.field.placeholder ? p.t(p.field.placeholder) : "Choose file"}
          <input
            id={p.id}
            type="file"
            hidden
            accept={p.field.accept?.join(",")}
            multiple={!!p.field.multiple}
            aria-describedby={p.describedBy}
            onChange={(e) => {
              const list = Array.from(e.target.files ?? []);
              p.onChange(p.field.multiple ? [...files, ...list] : list[0]);
              p.onBlur();
              e.currentTarget.value = "";
            }}
          />
        </label>
      </Button>
      <VStack align="stretch" gap="1" mt="2">
        {files.map((f) => {
          const up = p.uploads?.[fileKey(f)];
          return (
            <HStack key={`${f.name}:${f.size}`} gap="2" fontSize="sm">
              <Text flex="1" truncate>
                {f.name}
              </Text>
              {up?.status === "uploading" && (
                <ProgressRoot value={up.progress} width="24" size="xs">
                  <ProgressTrack>
                    <ProgressRange />
                  </ProgressTrack>
                </ProgressRoot>
              )}
              {up?.status === "done" && <Text color="green.500">✓</Text>}
              {up?.status === "error" && <Text color="red.500">upload failed</Text>}
              <IconButton
                aria-label={`Remove ${f.name}`}
                size="xs"
                variant="ghost"
                onClick={() => {
                  const next = files.filter((x) => x !== f);
                  p.onChange(p.field.multiple ? next : undefined);
                  p.onBlur();
                }}
              >
                ×
              </IconButton>
            </HStack>
          );
        })}
      </VStack>
    </Box>
  );
}

function ChakraHidden(p: FieldComponentProps<string>) {
  return <input id={p.id} type="hidden" value={p.value ?? ""} readOnly />;
}

export const chakraComponents: ComponentMap = {
  ...Object.fromEntries(TEXT_LIKE.map((t) => [t, ChakraText])),
  password: ChakraPassword,
  number: ChakraNumber,
  range: ChakraRange,
  textarea: ChakraTextarea,
  checkbox: ChakraCheckbox,
  switch: ChakraSwitch,
  select: ChakraSelect,
  multiselect: ChakraMultiSelect,
  radio: ChakraRadio,
  file: ChakraFile,
  hidden: ChakraHidden,
} as ComponentMap;

// ─────────────────────────────── slots ─────────────────────────────────

const BUTTON_VARIANT = { primary: "solid", secondary: "subtle", outline: "outline" } as const;

export function ChakraButton({ variant, ...props }: ButtonSlotProps) {
  return <Button variant={BUTTON_VARIANT[variant]} size="sm" {...props} />;
}

export function ChakraFieldWrapper({
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
    <FieldRoot invalid={invalid} required={required} aria-busy={validating || undefined}>
      {label && (
        <FieldLabel htmlFor={id} id={`${id}-label`}>
          {label}
          <FieldRequiredIndicator />
          {tooltip && (
            <Text as="span" title={tooltip} cursor="help" color="fg.muted" ms="1">
              ⓘ
            </Text>
          )}
          {validating && <Spinner size="xs" ms="1" />}
        </FieldLabel>
      )}
      {children}
      {description && (
        <FieldHelperText id={descriptionId}>{description}</FieldHelperText>
      )}
      {error && (
        <FieldErrorText id={errorId} role="alert">
          {error}
        </FieldErrorText>
      )}
    </FieldRoot>
  );
}

/** Chip-style clickable stepper (visited steps navigable via onStepClick). */
export function ChakraStepper({ steps, current, onStepClick }: StepperSlotProps) {
  return (
    <HStack gap="2" mb="4" wrap="wrap">
      {steps.map((s, i) => (
        <HStack key={s.id} gap="2">
          {i > 0 && <Separator width="4" />}
          <Button
            size="xs"
            variant={i === current ? "solid" : s.visited ? "outline" : "ghost"}
            disabled={!onStepClick || (!s.visited && i !== current)}
            onClick={onStepClick && s.visited && i !== current ? () => onStepClick(i) : undefined}
            aria-current={i === current ? "step" : undefined}
          >
            {i + 1}. {s.title}
          </Button>
        </HStack>
      ))}
    </HStack>
  );
}

export function ChakraArrayField({ label, description, error, onAdd, addLabel, children }: ArrayFieldSlotProps) {
  return (
    <Box>
      {label && (
        <Text fontWeight="medium" mb="1">
          {label}
        </Text>
      )}
      {description && (
        <Text fontSize="sm" color="fg.muted" mb="2">
          {description}
        </Text>
      )}
      <VStack align="stretch" gap="3">
        {children}
      </VStack>
      {error && (
        <Text role="alert" fontSize="sm" color="fg.error" mt="1">
          {error}
        </Text>
      )}
      {onAdd && (
        <Button variant="outline" size="sm" mt="2" onClick={onAdd}>
          + {addLabel}
        </Button>
      )}
    </Box>
  );
}

export function ChakraArrayItem({ index, onRemove, removeLabel, onMoveUp, onMoveDown, children }: ArrayItemSlotProps) {
  return (
    <Box borderWidth="1px" rounded="md" p="3">
      <HStack justify="space-between" mb="2">
        <Text fontSize="xs" color="fg.muted">
          #{index + 1}
        </Text>
        <HStack gap="1">
          {onMoveUp && (
            <IconButton aria-label="Move up" size="xs" variant="ghost" onClick={onMoveUp}>
              ↑
            </IconButton>
          )}
          {onMoveDown && (
            <IconButton aria-label="Move down" size="xs" variant="ghost" onClick={onMoveDown}>
              ↓
            </IconButton>
          )}
          {onRemove && (
            <IconButton aria-label={removeLabel} size="xs" variant="ghost" onClick={onRemove}>
              ×
            </IconButton>
          )}
        </HStack>
      </HStack>
      {children}
    </Box>
  );
}

export function ChakraReview({ groups, onEdit, editLabel }: ReviewSlotProps) {
  return (
    <VStack align="stretch" gap="4">
      {groups.map((g) => (
        <Box key={g.id} borderWidth="1px" rounded="md" p="4">
          <HStack justify="space-between" mb="2">
            <Text fontWeight="medium">{g.title}</Text>
            <Button size="xs" variant="ghost" onClick={() => onEdit(g.index)}>
              {editLabel}
            </Button>
          </HStack>
          <VStack align="stretch" gap="1">
            {g.items.map((it) => (
              <HStack key={it.name} fontSize="sm" align="start">
                <Text color="fg.muted" minW="40">
                  {it.label}
                </Text>
                <Text>{formatReviewValue(it.value)}</Text>
              </HStack>
            ))}
          </VStack>
        </Box>
      ))}
    </VStack>
  );
}

function formatReviewValue(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof File !== "undefined" && v instanceof File) return v.name;
  if (Array.isArray(v)) return v.map(formatReviewValue).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export const chakraSlots: Partial<FormSlots> = {
  Button: ChakraButton,
  FieldWrapper: ChakraFieldWrapper,
  Stepper: ChakraStepper,
  ArrayField: ChakraArrayField,
  ArrayItem: ChakraArrayItem,
  Review: ChakraReview,
};
