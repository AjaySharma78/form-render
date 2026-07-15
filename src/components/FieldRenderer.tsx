import { memo, useCallback, useSyncExternalStore } from "react";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import type { Field, FieldComponentProps } from "../types";
import { emptyRowFor } from "../compile/defaults";
import { useAsyncValidator } from "../engine/async";
import { coerceByType } from "../engine/coerce";
import { applyMask, stripMask } from "../engine/mask";
import { useComputedField, useFieldEffects } from "../engine/useComputed";
import { useFieldOptions } from "../engine/useFieldOptions";
import { useFieldState } from "../engine/useFieldState";
import { useFileUploads } from "../engine/uploads";
import { useFormRenderContext } from "./context";
import { FieldGrid } from "./FieldGrid";

function UnknownType({ field }: FieldComponentProps) {
  return (
    <div className="fr-error" role="alert">
      No component registered for field type "{field.type}" ({field.name}).
    </div>
  );
}

/**
 * Repeatable group: renders `field.item.fields` once per row via useFieldArray,
 * with add/remove/reorder controls injected through the ArrayField/ArrayItem
 * slots. Row inputs are addressed as `${name}.${index}.${child}`; conditions
 * inside rows resolve against the row (bare names) or the root (`$.`).
 */
function ArrayFieldRenderer({
  field,
  name,
  disabled,
}: {
  field: Field;
  name: string;
  disabled: boolean;
}) {
  const { control, getFieldState, formState } = useFormContext();
  const { t, slots } = useFormRenderContext();
  const { ArrayField, ArrayItem } = slots;
  const { fields: rows, append, remove, move } = useFieldArray({ control, name });

  const min = field.validation?.minItems?.value ?? 0;
  const max = field.validation?.maxItems?.value ?? Infinity;
  const canAdd = !disabled && rows.length < max;
  const canRemove = !disabled && rows.length > min;

  // array-level error (minItems/maxItems/required); row errors render per field.
  // RHF parks list-level messages under `.root` when index errors also exist.
  const err = getFieldState(name, formState).error as
    | { message?: string; root?: { message?: string } }
    | undefined;
  const error = err?.message ?? err?.root?.message;

  return (
    <ArrayField
      field={field}
      label={field.label ? t(field.label) : undefined}
      description={field.description ? t(field.description) : undefined}
      error={error}
      count={rows.length}
      onAdd={canAdd ? () => append(emptyRowFor(field)) : undefined}
      addLabel={t(field.addText ?? "Add")}
    >
      {rows.map((row, i) => (
        <ArrayItem
          key={row.id}
          index={i}
          count={rows.length}
          onRemove={canRemove ? () => remove(i) : undefined}
          removeLabel={t(field.removeText ?? "Remove")}
          onMoveUp={field.sortable && !disabled && i > 0 ? () => move(i, i - 1) : undefined}
          onMoveDown={
            field.sortable && !disabled && i < rows.length - 1 ? () => move(i, i + 1) : undefined
          }
        >
          <FieldGrid
            fields={field.item?.fields ?? []}
            layout={field.item?.layout}
            namePrefix={`${name}.${i}`}
          />
        </ArrayItem>
      ))}
    </ArrayField>
  );
}

function FieldRendererImpl({ field, namePrefix }: { field: Field; namePrefix?: string }) {
  const { control } = useFormContext();
  const {
    components,
    resolvers,
    loaders,
    formulas,
    uploaders,
    asyncRegistry,
    uploadRegistry,
    hiddenValues,
    t,
    slots,
  } = useFormRenderContext();
  const Wrapper = slots.FieldWrapper;
  const name = namePrefix ? `${namePrefix}.${field.name}` : field.name;
  const { visible, disabled: stateDisabled } = useFieldState(
    field,
    namePrefix,
    hiddenValues === "keep",
  );
  const optionsState = useFieldOptions(field, loaders, name);
  const runAsync = useAsyncValidator(field, resolvers, asyncRegistry, name, t);
  const uploads = useFileUploads(field, name, uploaders, uploadRegistry);
  useComputedField(field, formulas, name, namePrefix);
  useFieldEffects(field, name, namePrefix);
  const validating = useSyncExternalStore(
    asyncRegistry.subscribe,
    useCallback(() => asyncRegistry.get(name)?.status === "validating", [asyncRegistry, name]),
    () => false,
  );
  // computed fields are read-only unless explicitly editable
  const disabled = stateDisabled || (!!field.computed && !field.editable);

  if (!visible) return null;

  if (field.type === "array" && field.item) {
    return <ArrayFieldRenderer field={field} name={name} disabled={disabled} />;
  }

  const Comp = components[field.type] ?? UnknownType;
  const required = !!field.validation?.required || !!field.requiredWhen;
  const fieldWithOptions: Field = field.optionsSource
    ? { ...field, options: optionsState.options }
    : field;
  const mask = field.mask;

  return (
    <Controller
      name={name}
      control={control}
      render={({ field: rhf, fieldState }) => {
        const error = fieldState.error?.message;
        // stable ids for the description/error nodes → aria-describedby
        const descriptionId = field.description ? `${name}-description` : undefined;
        const errorId = error ? `${name}-error` : undefined;
        const describedBy =
          [descriptionId, errorId].filter(Boolean).join(" ") || undefined;
        return (
          <Wrapper
            field={field}
            id={name}
            label={field.label ? t(field.label) : undefined}
            description={field.description ? t(field.description) : undefined}
            tooltip={field.tooltip ? t(field.tooltip) : undefined}
            error={error}
            required={required}
            invalid={!!error}
            validating={validating}
            descriptionId={descriptionId}
            errorId={errorId}
          >
            <Comp
              field={fieldWithOptions}
              id={name}
              value={
                mask && typeof rhf.value === "string" ? applyMask(rhf.value, mask) : rhf.value
              }
              disabled={disabled}
              error={error}
              validating={validating}
              optionsState={field.optionsSource ? optionsState : undefined}
              describedBy={describedBy}
              uploads={uploads}
              t={t}
              onChange={(v: unknown) =>
                rhf.onChange(
                  mask && typeof v === "string"
                    ? stripMask(v, mask)
                    : coerceByType(fieldWithOptions, v),
                )
              }
              onBlur={() => {
                rhf.onBlur();
                runAsync();
              }}
            />
          </Wrapper>
        );
      }}
    />
  );
}

/**
 * Memoized so a field doesn't re-render when the form re-renders for unrelated
 * reasons (e.g. a conditional-step toggle). Field-local updates still flow
 * through the Controller and the scoped useWatch hooks inside.
 */
export const FieldRenderer = memo(FieldRendererImpl);
