import type {
  ArrayFieldSlotProps,
  ArrayItemSlotProps,
  ButtonSlotProps,
  ContainerSlotProps,
  FieldWrapperProps,
  FormSlots,
  GridSlotProps,
  CellSlotProps,
  ReviewSlotProps,
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
  tooltip,
  error,
  required,
  invalid,
  validating,
  descriptionId,
  errorId,
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
      data-validating={validating || undefined}
      aria-busy={validating || undefined}
    >
      {label && (
        <label
          htmlFor={id}
          id={`${id}-label`}
          className={cn("fr-label", form?.label, field.classNames?.label)}
        >
          {label}
          {required && (
            <span className="fr-required" aria-hidden="true">
              {" *"}
            </span>
          )}
          {tooltip && (
            <span className="fr-tooltip" title={tooltip} tabIndex={0} aria-label={tooltip}>
              ?
            </span>
          )}
        </label>
      )}
      {children}
      {description && (
        <p
          id={descriptionId}
          className={cn("fr-description", form?.description, field.classNames?.description)}
        >
          {description}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          role="alert"
          className={cn("fr-error", form?.error, field.classNames?.error)}
        >
          {error}
        </p>
      )}
    </div>
  );
}

function DefaultTitle({ children }: ContainerSlotProps) {
  return <h2 className="fr-title">{children}</h2>;
}

function DefaultStepper({ steps, current, onStepClick }: StepperSlotProps) {
  return (
    <div className="fr-stepper" aria-label="progress">
      {steps.map((s, i) =>
        onStepClick && s.visited && i !== current ? (
          <button
            key={s.id}
            type="button"
            className="fr-step-chip"
            data-done={i < current}
            onClick={() => onStepClick(i)}
          >
            {s.title}
          </button>
        ) : (
          <span
            key={s.id}
            className="fr-step-chip"
            data-active={i === current}
            data-done={i < current}
            aria-current={i === current ? "step" : undefined}
          >
            {s.title}
          </span>
        ),
      )}
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

/** Compact display for arbitrary review values. */
function formatReviewValue(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof File !== "undefined" && v instanceof File) return v.name;
  if (Array.isArray(v)) {
    if (v.length === 0) return "—";
    if (v.every((x) => typeof x !== "object" || x === null)) return v.map(String).join(", ");
    return `${v.length} item${v.length === 1 ? "" : "s"}`;
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function DefaultReview({ groups, onEdit, editLabel }: ReviewSlotProps) {
  return (
    <div className="fr-review">
      {groups.map((g) => (
        <section key={g.id} className="fr-review-group">
          <header className="fr-review-header">
            <h4 className="fr-review-title">{g.title}</h4>
            <button
              type="button"
              className="fr-btn fr-btn-outline fr-review-edit"
              onClick={() => onEdit(g.index)}
            >
              {editLabel}
            </button>
          </header>
          <dl className="fr-review-items">
            {g.items.map((item) => (
              <div key={item.name} className="fr-review-item">
                <dt className="fr-review-label">{item.label}</dt>
                <dd className="fr-review-value">{formatReviewValue(item.value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

function DefaultArrayField({
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
      className="fr-array"
      data-field={field.name}
      data-type="array"
      data-invalid={!!error}
    >
      {label && <legend className="fr-array-label">{label}</legend>}
      {description && <p className="fr-description">{description}</p>}
      <div className="fr-array-items">{children}</div>
      {error && (
        <p role="alert" className="fr-error">
          {error}
        </p>
      )}
      <button type="button" className="fr-btn fr-btn-secondary fr-array-add" disabled={!onAdd} onClick={onAdd}>
        {addLabel}
      </button>
    </fieldset>
  );
}

function DefaultArrayItem({
  index,
  onRemove,
  removeLabel,
  onMoveUp,
  onMoveDown,
  children,
}: ArrayItemSlotProps) {
  return (
    <div className="fr-array-item" data-index={index}>
      <div className="fr-array-item-body">{children}</div>
      <div className="fr-array-item-controls">
        {onMoveUp !== undefined || onMoveDown !== undefined ? (
          <>
            <button
              type="button"
              className="fr-btn fr-btn-outline fr-array-move"
              aria-label={`Move item ${index + 1} up`}
              disabled={!onMoveUp}
              onClick={onMoveUp}
            >
              ↑
            </button>
            <button
              type="button"
              className="fr-btn fr-btn-outline fr-array-move"
              aria-label={`Move item ${index + 1} down`}
              disabled={!onMoveDown}
              onClick={onMoveDown}
            >
              ↓
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="fr-btn fr-btn-outline fr-array-remove"
          aria-label={`${removeLabel} item ${index + 1}`}
          disabled={!onRemove}
          onClick={onRemove}
        >
          {removeLabel}
        </button>
      </div>
    </div>
  );
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
  ArrayField: DefaultArrayField,
  ArrayItem: DefaultArrayItem,
  Review: DefaultReview,
};
