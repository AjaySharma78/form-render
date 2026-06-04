import type {
  ButtonSlotProps,
  ContainerSlotProps,
  FieldWrapperProps,
  FormSlots,
  GridSlotProps,
  CellSlotProps,
  SectionSlotProps,
  StepSlotProps,
  StepperSlotProps,
} from "../types";
import { cn } from "../utils/cn";
import { useFormRenderContext } from "./context";

/**
 * Default UI slots — semantic markup with stable `fr-*` class + data hooks.
 * Each is replaceable via <FormRender slots={...}>. A consumer styles these
 * with plain CSS; the shadcn bundle replaces them entirely.
 */

function DefaultButton({ type, variant, disabled, onClick, children }: ButtonSlotProps) {
  return (
    <button
      type={type}
      className={cn("fr-btn", `fr-btn-${variant}`)}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function DefaultFieldWrapper({
  field,
  id,
  label,
  description,
  error,
  required,
  invalid,
  children,
}: FieldWrapperProps) {
  const { classNames: form } = useFormRenderContext();
  return (
    <div
      className={cn("fr-field", form?.wrapper, field.classNames?.wrapper)}
      style={field.style}
      data-field={field.name}
      data-type={field.type}
      data-invalid={invalid}
    >
      {label && (
        <label htmlFor={id} className={cn("fr-label", form?.label, field.classNames?.label)}>
          {label}
          {required && (
            <span className="fr-required" aria-hidden="true">
              {" *"}
            </span>
          )}
        </label>
      )}
      {children}
      {description && (
        <p className={cn("fr-description", form?.description, field.classNames?.description)}>
          {description}
        </p>
      )}
      {error && (
        <p role="alert" className={cn("fr-error", form?.error, field.classNames?.error)}>
          {error}
        </p>
      )}
    </div>
  );
}

function DefaultTitle({ children }: ContainerSlotProps) {
  return <h2 className="fr-title">{children}</h2>;
}

function DefaultStepper({ steps, current }: StepperSlotProps) {
  return (
    <div className="fr-stepper" aria-label="progress">
      {steps.map((s, i) => (
        <span
          key={s.id}
          className="fr-step-chip"
          data-active={i === current}
          data-done={i < current}
        >
          {s.title}
        </span>
      ))}
    </div>
  );
}

function DefaultStep({ title, description, disabled, children }: StepSlotProps) {
  return (
    <fieldset className="fr-step" disabled={disabled}>
      {title && <h3 className="fr-step-title">{title}</h3>}
      {description && <p className="fr-step-description">{description}</p>}
      {children}
    </fieldset>
  );
}

function DefaultSection({ title, description, collapsible, defaultOpen, children }: SectionSlotProps) {
  if (collapsible) {
    return (
      <details className="fr-section" open={defaultOpen ?? true}>
        <summary className="fr-section-title">{title}</summary>
        {description && <p className="fr-section-description">{description}</p>}
        {children}
      </details>
    );
  }
  return (
    <fieldset className="fr-section">
      {title && <legend className="fr-section-title">{title}</legend>}
      {description && <p className="fr-section-description">{description}</p>}
      {children}
    </fieldset>
  );
}

function DefaultGrid({ columns, children }: GridSlotProps) {
  return (
    <div
      className="fr-grid"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: "1rem",
      }}
    >
      {children}
    </div>
  );
}

function DefaultCell({ span, children }: CellSlotProps) {
  return <div style={{ gridColumn: `span ${span}` }}>{children}</div>;
}

function DefaultActions({ children }: ContainerSlotProps) {
  return <div className="fr-actions">{children}</div>;
}

export const defaultSlots: FormSlots = {
  Button: DefaultButton,
  FieldWrapper: DefaultFieldWrapper,
  Title: DefaultTitle,
  Stepper: DefaultStepper,
  Step: DefaultStep,
  Section: DefaultSection,
  Grid: DefaultGrid,
  Cell: DefaultCell,
  Actions: DefaultActions,
};
