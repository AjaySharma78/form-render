import { memo } from "react";
import { Controller, useFormContext } from "react-hook-form";
import type { Field, FieldComponentProps } from "../types";
import { coerceByType } from "../engine/coerce";
import { useAsyncValidator } from "../engine/useAsyncValidator";
import { useFieldOptions } from "../engine/useFieldOptions";
import { useFieldState } from "../engine/useFieldState";
import { useFormRenderContext } from "./context";

function UnknownType({ field }: FieldComponentProps) {
  return (
    <div className="fr-error" role="alert">
      No component registered for field type "{field.type}" ({field.name}).
    </div>
  );
}

function FieldRendererImpl({ field }: { field: Field }) {
  const { control } = useFormContext();
  const { components, resolvers, loaders, t, slots } = useFormRenderContext();
  const Wrapper = slots.FieldWrapper;
  const { visible, disabled } = useFieldState(field);
  const options = useFieldOptions(field, loaders);
  const runAsync = useAsyncValidator(field, resolvers);

  if (!visible) return null;

  const Comp = components[field.type] ?? UnknownType;
  const required = !!field.validation?.required || !!field.requiredWhen;
  const fieldWithOptions: Field = field.optionsSource ? { ...field, options } : field;

  return (
    <Controller
      name={field.name}
      control={control}
      render={({ field: rhf, fieldState }) => {
        const error = fieldState.error?.message;
        return (
          <Wrapper
            field={field}
            id={field.name}
            label={field.label ? t(field.label) : undefined}
            description={field.description ? t(field.description) : undefined}
            error={error}
            required={required}
            invalid={!!error}
          >
            <Comp
              field={fieldWithOptions}
              id={field.name}
              value={rhf.value}
              disabled={disabled}
              error={error}
              t={t}
              onChange={(v: unknown) => rhf.onChange(coerceByType(field, v))}
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
