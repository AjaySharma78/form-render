// @ts-nocheck — Template file. The "@/..." imports resolve only inside YOUR app
// (your shadcn components + tsconfig paths), not in this repo, so type-checking
// is disabled here. Once copied into your project, remove this line.
/**
 * shadcn adapter — COPY THIS FILE INTO YOUR APP (e.g. src/lib/form-render-shadcn.tsx).
 *
 * It is a template, not part of the compiled package, because it imports your
 * own shadcn components from "@/components/ui/*" — those live in your project,
 * not in node_modules. Adjust the import paths to match your setup.
 *
 * Prereqs (your app must have Tailwind + shadcn set up — `npx shadcn@latest init`):
 *   npx shadcn@latest add input textarea checkbox switch select radio-group label button field popover command tooltip calendar
 *   npm i react-dropzone lucide-react   (the file-field Dropzone + the icons used here)
 *
 * The file field uses a drag-and-drop Dropzone:
 *   Copy templates/dropzone.tsx (shipped with this package) into your app at
 *   @/components/ui/dropzone.tsx. It exposes Dropzone / DropzoneEmptyState /
 *   DropzoneContent and only needs your shadcn Button + cn.
 *
 * Usage (100% shadcn — no custom markup):
 *   import { FormRender } from "schema-form-engine";
 *   import { shadcnComponents, shadcnSlots } from "@/lib/form-render-shadcn";
 *   <FormRender
 *     schema={schema}
 *     components={shadcnComponents}
 *     slots={shadcnSlots}
 *     onSubmit={save}
 *   />
 */
import type {
  ArrayFieldSlotProps,
  ArrayItemSlotProps,
  ButtonSlotProps,
  CellSlotProps,
  ComponentMap,
  ContainerSlotProps,
  FieldComponentProps,
  FieldWrapperProps,
  FormSlots,
  GridSlotProps,
  SectionSlotProps,
  StepSlotProps,
  StepperSlotProps,
} from "schema-form-engine";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BadgeQuestionMark,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Eye,
  EyeOff,
  FileIcon,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { Accept, FileRejection } from "react-dropzone";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dropzone, DropzoneContent, DropzoneEmptyState } from "@/components/ui/dropzone";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// date / datetime-local / month get shadcn Calendar pickers (below) instead
const TEXT_LIKE = ["text", "email", "search", "tel", "url", "color", "time", "week"] as const;

const BUTTON_VARIANT = { primary: "default", secondary: "secondary", outline: "outline" } as const;

/** Button slot for nav/action buttons. Use via <FormRender Button={FormButton} />. */
export function FormButton({ variant, ...props }: ButtonSlotProps) {
  return <Button variant={BUTTON_VARIANT[variant]} {...props} />;
}

const HORIZONTAL = new Set(["checkbox", "switch"]);

/** Field wrapper using shadcn Field primitives (native invalid styling). */
export function ShadcnFieldWrapper({
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
  // field.tooltip wins the help icon; description falls back into it
  const hint = tooltip ?? description;
  return (
    <Field
      data-invalid={invalid}
      aria-busy={validating || undefined}
      orientation={HORIZONTAL.has(field.type) ? "horizontal" : "vertical"}
    >
      {label && (
        <FieldLabel htmlFor={id} id={`${id}-label`} className="flex items-center gap-1.5">
          <span>
            {label}
            {required && <span className="text-destructive"> *</span>}
          </span>
          {hint && (
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <BadgeQuestionMark
                    size={14}
                    className="text-muted-foreground hover:text-foreground cursor-help"
                    aria-label="More information"
                  />
                </TooltipTrigger>
                <TooltipContent side="top" align="center">
                  {hint}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </FieldLabel>
      )}
      {children}
      {/* the visible description lives in the tooltip; give aria-describedby a real node */}
      {description && (
        <span id={descriptionId} className="sr-only">
          {description}
        </span>
      )}
      {error && (
        <span id={errorId}>
          <FieldError errors={[{ message: error }]} />
        </span>
      )}
    </Field>
  );
}

function TextField(p: FieldComponentProps<string>) {
  return (
    <Input
      id={p.id}
      type={p.field.type}
      className={cn(p.field.className, p.field.classNames?.control)}
      value={p.value ?? ""}
      placeholder={p.field.placeholder ? p.t(p.field.placeholder) : undefined}
      disabled={p.disabled}
      readOnly={p.field.readOnly}
      step={p.field.step}
      onChange={(e) => p.onChange(e.target.value)}
      onBlur={p.onBlur}
    />
  );
}

// Password field with a built-in show/hide toggle.
function PasswordField(p: FieldComponentProps<string>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={p.id}
        type={visible ? "text" : "password"}
        className={cn("pr-10", p.field.className, p.field.classNames?.control)}
        value={p.value ?? ""}
        placeholder={p.field.placeholder ? p.t(p.field.placeholder) : undefined}
        disabled={p.disabled}
        readOnly={p.field.readOnly}
        onChange={(e) => p.onChange(e.target.value)}
        onBlur={p.onBlur}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        tabIndex={-1}
        disabled={p.disabled}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
        className="text-muted-foreground absolute top-1/2 right-1 size-7 -translate-y-1/2 hover:bg-transparent"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </Button>
    </div>
  );
}

function NumberField(p: FieldComponentProps<number | "">) {
  return (
    <Input
      id={p.id}
      type="number"
      className={cn(p.field.className, p.field.classNames?.control)}
      value={p.value ?? ""}
      disabled={p.disabled}
      step={p.field.step}
      onChange={(e) => p.onChange(e.target.value === "" ? "" : Number(e.target.value))}
      onBlur={p.onBlur}
    />
  );
}

function TextAreaField(p: FieldComponentProps<string>) {
  return (
    <Textarea
      id={p.id}
      rows={p.field.rows ?? 4}
      className={cn(p.field.className, p.field.classNames?.control)}
      value={p.value ?? ""}
      placeholder={p.field.placeholder ? p.t(p.field.placeholder) : undefined}
      disabled={p.disabled}
      onChange={(e) => p.onChange(e.target.value)}
      onBlur={p.onBlur}
    />
  );
}

function CheckboxField(p: FieldComponentProps<boolean>) {
  return (
    <Checkbox id={p.id} checked={!!p.value} disabled={p.disabled} onCheckedChange={(c) => p.onChange(!!c)} />
  );
}

function SwitchField(p: FieldComponentProps<boolean>) {
  return <Switch id={p.id} checked={!!p.value} disabled={p.disabled} onCheckedChange={(c) => p.onChange(!!c)} />;
}

function SingleSelectField(p: FieldComponentProps<string>) {
  return (
    <Select value={p.value ?? ""} disabled={p.disabled} onValueChange={p.onChange}>
      <SelectTrigger id={p.id} className={cn("w-full", p.field.className)} aria-invalid={!!p.error}>
        <SelectValue placeholder={p.field.placeholder ? p.t(p.field.placeholder) : "Select…"} />
      </SelectTrigger>
      <SelectContent>
        {(p.field.options ?? []).map((o) => (
          <SelectItem key={String(o.value)} value={String(o.value)}>
            {p.t(o.label)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Dropdown multi-select (Popover + Command), value is an array.
function MultiSelectField(p: FieldComponentProps<(string | number)[]>) {
  const [open, setOpen] = useState(false);
  const options = p.field.options ?? [];
  const selected = p.value ?? [];
  const toggle = (value: string | number) =>
    p.onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  const labels = options.filter((o) => selected.includes(o.value)).map((o) => p.t(o.label));

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) p.onBlur(); }}>
      <PopoverTrigger asChild>
        <button
          id={p.id}
          type="button"
          disabled={p.disabled}
          aria-invalid={!!p.error}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20",
            p.field.className,
          )}
        >
          <span className={cn("truncate text-left", labels.length === 0 && "text-muted-foreground")}>
            {labels.length ? labels.join(", ") : p.field.placeholder ? p.t(p.field.placeholder) : "Select…"}
          </span>
          <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Search…" />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={String(o.value)} value={p.t(o.label)} onSelect={() => toggle(o.value)}>
                  <CheckIcon className={cn("mr-2 size-4", selected.includes(o.value) ? "opacity-100" : "opacity-0")} />
                  {p.t(o.label)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// `select` renders single or multi based on the `multiple` flag.
function SelectField(p: FieldComponentProps<string | (string | number)[]>) {
  return p.field.multiple ? (
    <MultiSelectField {...(p as FieldComponentProps<(string | number)[]>)} />
  ) : (
    <SingleSelectField {...(p as FieldComponentProps<string>)} />
  );
}

function RadioField(p: FieldComponentProps<string>) {
  return (
    <RadioGroup value={p.value ?? ""} onValueChange={p.onChange} disabled={p.disabled} className="flex flex-wrap gap-4">
      {(p.field.options ?? []).map((o) => (
        <label key={String(o.value)} className="flex items-center gap-2 text-sm">
          <RadioGroupItem value={String(o.value)} />
          {p.t(o.label)}
        </label>
      ))}
    </RadioGroup>
  );
}

// Build react-dropzone's `accept` map from the JSON `field.accept` list.
// MIME entries (containing "/") become keys; bare extensions are bucketed
// under a catch-all key so they still filter by file name.
function toAccept(accept?: readonly string[]): Accept | undefined {
  if (!accept?.length) return undefined;
  const out: Record<string, string[]> = {};
  for (const entry of accept) {
    if (entry.includes("/")) out[entry] ??= [];
    else (out["application/octet-stream"] ??= []).push(entry);
  }
  return out as Accept;
}

// Coerce to a list of *real* File objects. Guards against non-File values that
// can sneak in from a restored draft (persisted Files JSON-serialize to {}).
const isFile = (v: unknown): v is File => typeof File !== "undefined" && v instanceof File;
const asFileList = (value: File | File[] | undefined): File[] =>
  (Array.isArray(value) ? value : value ? [value] : []).filter(isFile);

const formatSize = (bytes: number): string =>
  bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/**
 * Drag-and-drop file field, driven entirely by the JSON:
 * - `field.multiple`            → single (replace) vs. multiple (append) selection
 * - `field.accept`              → accepted MIME types / extensions
 * - `field.validation.maxFiles` → file-count cap (multiple only)
 * - `field.validation.maxSize`  → per-file size cap (MB)
 *
 * It only selects files into form state; uploading is your job at submit time.
 * Per-file size/count/type rules are also enforced by the schema's Zod layer,
 * so this is instant-feedback UX on top of the real validation.
 */
function FileField(p: FieldComponentProps<File | File[] | undefined>) {
  const { field } = p;
  const [rejected, setRejected] = useState<string | null>(null);
  const files = asFileList(p.value);
  const multiple = !!field.multiple;
  const maxFiles = multiple ? field.validation?.maxFiles?.value ?? 10 : 1;
  const maxSize = field.validation?.maxSize?.value;

  const commit = (next: File[]) => {
    p.onChange(multiple ? next : next[0]);
    p.onBlur();
  };

  const handleDrop = (accepted: File[], rejections: FileRejection[]) => {
    setRejected(rejections[0]?.errors[0]?.message ?? null);
    if (!accepted.length) return;
    if (!multiple) {
      commit([accepted[0]]);
      return;
    }
    const merged = [...files];
    for (const f of accepted) {
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
    <div className="flex flex-col gap-2">
      <Dropzone
        accept={toAccept(field.accept)}
        multiple={multiple}
        maxFiles={maxFiles}
        maxSize={maxSize ? maxSize * 1024 * 1024 : undefined}
        disabled={p.disabled}
        src={files.length ? files : undefined}
        onDrop={handleDrop}
      >
        <DropzoneEmptyState />
        <DropzoneContent>
          <p className="text-sm font-medium">
            {files.length} file{files.length === 1 ? "" : "s"} selected
          </p>
          <p className="text-muted-foreground text-xs">
            Drag and drop or click to {multiple ? "add more" : "replace"}
          </p>
        </DropzoneContent>
      </Dropzone>

      {rejected && <p className="text-destructive text-xs">{rejected}</p>}

      {files.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {files.map((f) => (
            <li
              key={`${f.name}:${f.size}`}
              className="bg-muted/30 flex items-center justify-between gap-2 rounded-md border p-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <FileIcon className="text-muted-foreground size-4 shrink-0" />
                <span className="truncate text-xs font-medium">{f.name}</span>
                <span className="text-muted-foreground shrink-0 text-[10px]">
                  ({formatSize(f.size)})
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6"
                disabled={p.disabled}
                onClick={() => removeFile(f.name, f.size)}
                aria-label={`Remove ${f.name}`}
              >
                <X className="size-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── date pickers (shadcn Calendar in a Popover; values stay ISO strings) ──

const pad2 = (n: number) => String(n).padStart(2, "0");

// hoisted: Intl formatter construction is expensive — never do it per render
const DATE_FMT = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const MONTH_FMT = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

function parseISODate(s: string | undefined): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return undefined;
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

const toISODate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function dateBounds(field: FieldComponentProps["field"]) {
  const min = typeof field.min === "string" ? parseISODate(field.min) : undefined;
  const max = typeof field.max === "string" ? parseISODate(field.max) : undefined;
  return [...(min ? [{ before: min }] : []), ...(max ? [{ after: max }] : [])];
}

function pickerTriggerClass(p: FieldComponentProps<string>, empty: boolean) {
  return cn(
    "w-full justify-start text-left font-normal",
    empty && "text-muted-foreground",
    p.field.className,
    p.field.classNames?.control,
  );
}

/** `date` — value "yyyy-MM-dd". */
function DateField(p: FieldComponentProps<string>) {
  const [open, setOpen] = useState(false);
  const selected = parseISODate(p.value);
  const disabledDays = dateBounds(p.field);
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) p.onBlur();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={p.id}
          type="button"
          variant="outline"
          disabled={p.disabled}
          aria-invalid={p.error ? true : undefined}
          aria-describedby={p.describedBy}
          className={pickerTriggerClass(p, !selected)}
        >
          <CalendarIcon className="size-4" />
          {selected
            ? DATE_FMT.format(selected)
            : p.field.placeholder
              ? p.t(p.field.placeholder)
              : "Pick a date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          disabled={disabledDays.length ? disabledDays : undefined}
          onSelect={(d) => {
            p.onChange(d ? toISODate(d) : "");
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** `datetime-local` — value "yyyy-MM-ddTHH:mm" (Calendar + a time input). */
function DateTimeField(p: FieldComponentProps<string>) {
  const [open, setOpen] = useState(false);
  const [datePart = "", timePart = ""] = (p.value ?? "").split("T");
  const selected = parseISODate(datePart);
  const disabledDays = dateBounds(p.field);
  const commit = (d: string, t: string) => p.onChange(d ? `${d}T${t || "00:00"}` : "");
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) p.onBlur();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={p.id}
          type="button"
          variant="outline"
          disabled={p.disabled}
          aria-invalid={p.error ? true : undefined}
          aria-describedby={p.describedBy}
          className={pickerTriggerClass(p, !selected)}
        >
          <CalendarIcon className="size-4" />
          {selected
            ? `${DATE_FMT.format(selected)}${timePart ? ` · ${timePart}` : ""}`
            : p.field.placeholder
              ? p.t(p.field.placeholder)
              : "Pick date & time"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          disabled={disabledDays.length ? disabledDays : undefined}
          onSelect={(d) => commit(d ? toISODate(d) : "", timePart)}
        />
        <div className="border-t p-3">
          <Input
            type="time"
            aria-label="Time"
            value={timePart}
            disabled={!selected}
            onChange={(e) => commit(datePart, e.target.value)}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** `month` — value "yyyy-MM" (year stepper + month grid, shadcn primitives only). */
function MonthField(p: FieldComponentProps<string>) {
  const [open, setOpen] = useState(false);
  const value = /^\d{4}-\d{2}$/.test(p.value ?? "") ? p.value! : "";
  const [year, setYear] = useState(() =>
    value ? Number(value.slice(0, 4)) : new Date().getFullYear(),
  );
  const monthNames = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) =>
        new Intl.DateTimeFormat(undefined, { month: "short" }).format(new Date(2000, i, 1)),
      ),
    [],
  );
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) p.onBlur();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={p.id}
          type="button"
          variant="outline"
          disabled={p.disabled}
          aria-invalid={p.error ? true : undefined}
          aria-describedby={p.describedBy}
          className={pickerTriggerClass(p, !value)}
        >
          <CalendarIcon className="size-4" />
          {value
            ? MONTH_FMT.format(new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, 1))
            : p.field.placeholder
              ? p.t(p.field.placeholder)
              : "Pick a month"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="mb-2 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Previous year"
            onClick={() => setYear((y) => y - 1)}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <span className="text-sm font-medium">{year}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Next year"
            onClick={() => setYear((y) => y + 1)}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {monthNames.map((label, i) => {
            const monthValue = `${year}-${pad2(i + 1)}`;
            return (
              <Button
                key={label}
                type="button"
                size="sm"
                variant={value === monthValue ? "default" : "ghost"}
                onClick={() => {
                  p.onChange(monthValue);
                  setOpen(false);
                }}
              >
                {label}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export const shadcnComponents: ComponentMap = {
  ...Object.fromEntries(TEXT_LIKE.map((t) => [t, TextField])),
  password: PasswordField,
  number: NumberField,
  range: NumberField,
  textarea: TextAreaField,
  checkbox: CheckboxField,
  switch: SwitchField,
  select: SelectField,
  multiselect: MultiSelectField,
  radio: RadioField,
  file: FileField,
  date: DateField,
  "datetime-local": DateTimeField,
  month: MonthField,
} as ComponentMap;

// ── layout slots: shadcn primitives + Tailwind (no custom CSS) ──

function Title({ children }: ContainerSlotProps) {
  return <h2 className="text-2xl font-semibold tracking-tight mb-6">{children}</h2>;
}

function Stepper({ steps, current }: StepperSlotProps) {
  return (
    <ol className="flex flex-wrap gap-2 mb-6">
      {steps.map((s, i) => (
        <li
          key={s.id}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium",
            i === current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {s.title}
        </li>
      ))}
    </ol>
  );
}

function Step({ title, description, disabled, children }: StepSlotProps) {
  return (
    <fieldset disabled={disabled} className="space-y-6 disabled:opacity-60">
      {(title || description) && (
        <div className="space-y-1">
          {title && <h3 className="text-lg font-semibold leading-none tracking-tight">{title}</h3>}
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      )}
      {children}
    </fieldset>
  );
}

function Section({ title, description, children }: SectionSlotProps) {
  return (
    <section className="space-y-4 border-b py-6 first:pt-0 last:border-b-0 last:pb-0">
      {(title || description) && (
        <div className="space-y-0.5">
          {title && <h4 className="text-sm font-semibold text-foreground">{title}</h4>}
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

function Grid({ children }: GridSlotProps) {
  return <div className="grid grid-cols-12 gap-4">{children}</div>;
}

// literal classes so Tailwind's scanner picks them up
const COL_SPAN: Record<number, string> = {
  1: "col-span-12 sm:col-span-6 md:col-span-1",
  2: "col-span-12 sm:col-span-6 md:col-span-2",
  3: "col-span-12 sm:col-span-6 md:col-span-3",
  4: "col-span-12 sm:col-span-6 md:col-span-4",
  5: "col-span-12 sm:col-span-6 md:col-span-5",
  6: "col-span-12 sm:col-span-6 md:col-span-6",
  7: "col-span-12 md:col-span-7",
  8: "col-span-12 md:col-span-8",
  9: "col-span-12 md:col-span-9",
  10: "col-span-12 md:col-span-10",
  11: "col-span-12 md:col-span-11",
  12: "col-span-12",
};

function Cell({ span, children }: CellSlotProps) {
  return <div className={COL_SPAN[span] ?? "col-span-12"}>{children}</div>;
}

function Actions({ children }: ContainerSlotProps) {
  return <div className="flex items-center gap-2 mt-8 [&>*:last-child]:ms-auto">{children}</div>;
}

/** Repeatable group container: label + rows + Add button, error styled like FieldError. */
function ArrayFieldSlot({
  field,
  label,
  description,
  error,
  onAdd,
  addLabel,
  children,
}: ArrayFieldSlotProps) {
  return (
    <fieldset
      className={cn("space-y-3 rounded-lg border p-4", error && "border-destructive")}
      data-field={field.name}
    >
      {label && <legend className="px-1 text-sm font-semibold">{label}</legend>}
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      <div className="space-y-3">{children}</div>
      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      <Button type="button" variant="secondary" size="sm" disabled={!onAdd} onClick={onAdd}>
        <Plus className="size-4" />
        {addLabel}
      </Button>
    </fieldset>
  );
}

/** One row of a repeatable group: the row grid + remove/reorder controls. */
function ArrayItemSlot({
  index,
  onRemove,
  removeLabel,
  onMoveUp,
  onMoveDown,
  children,
}: ArrayItemSlotProps) {
  const sortable = onMoveUp !== undefined || onMoveDown !== undefined;
  return (
    <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3">
      <div className="min-w-0 flex-1">{children}</div>
      <div className="flex flex-col gap-1">
        {sortable && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Move item ${index + 1} up`}
              disabled={!onMoveUp}
              onClick={onMoveUp}
            >
              <ArrowUp className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Move item ${index + 1} down`}
              disabled={!onMoveDown}
              onClick={onMoveDown}
            >
              <ArrowDown className="size-4" />
            </Button>
          </>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`${removeLabel} item ${index + 1}`}
          disabled={!onRemove}
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/** Full shadcn slot bundle — <FormRender slots={shadcnSlots} /> renders with zero custom markup. */
export const shadcnSlots: Partial<FormSlots> = {
  Button: FormButton,
  FieldWrapper: ShadcnFieldWrapper,
  Title,
  Stepper,
  Step,
  Section,
  Grid,
  Cell,
  Actions,
  ArrayField: ArrayFieldSlot,
  ArrayItem: ArrayItemSlot,
};
