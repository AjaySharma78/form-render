import { useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import type { Field, FormValues, LayoutRow, Section, Step } from "../types";
import { evaluateVisibility, extractDeps } from "../engine/condition";
import { widthToSpan } from "../utils/cn";
import { useFormRenderContext } from "./context";
import { FieldRenderer } from "./FieldRenderer";

/** 12-column grid base; field width / layout span maps onto it. */
const GRID_COLUMNS = 12;

/** Render a set of fields either by explicit layout rows or by flow (per-field width). */
function FieldGrid({ fields, layout }: { fields: Field[]; layout?: LayoutRow[] }) {
  const { slots } = useFormRenderContext();
  const { Grid, Cell } = slots;
  const byName = useMemo(() => new Map(fields.map((f) => [f.name, f])), [fields]);

  const cells =
    layout && layout.length
      ? // explicit layout: distribute the 12 columns evenly across each row's
        // fields, unless a cell gives an explicit span or the field a width.
        layout.flatMap((row) => {
          const even = Math.max(1, Math.floor(GRID_COLUMNS / row.length));
          return row.map((cell) => {
            const name = typeof cell === "string" ? cell : cell.field;
            const explicitSpan = typeof cell === "string" ? undefined : cell.span;
            const field = byName.get(name);
            if (!field) return null;
            const span = explicitSpan ?? (field.width != null ? widthToSpan(field.width) : even);
            return { field, span };
          });
        })
      : // flow layout: each field uses its own width (default full).
        fields.map((field) => ({ field, span: widthToSpan(field.width) }));

  return (
    <Grid columns={GRID_COLUMNS}>
      {cells.map((c) =>
        c ? (
          <Cell key={c.field.name} span={c.span}>
            <FieldRenderer field={c.field} />
          </Cell>
        ) : null,
      )}
    </Grid>
  );
}

function SectionView({ section, fields }: { section: Section; fields: Field[] }) {
  const { control } = useFormContext();
  const { t, slots } = useFormRenderContext();
  const deps = useMemo(() => extractDeps(section.visibleWhen), [section.visibleWhen]);
  const watched = useWatch({ control, name: deps.length ? deps : ["__never__"] });

  const visible = useMemo(() => {
    const v: FormValues = {};
    deps.forEach((n, i) => (v[n] = (watched as unknown[])[i]));
    return evaluateVisibility(section.visibleWhen, v);
  }, [deps, watched, section.visibleWhen]);

  if (!visible) return null;

  const sectionFields = section.fields
    .map((n) => fields.find((f) => f.name === n))
    .filter((f): f is Field => !!f);

  return (
    <slots.Section
      id={section.id}
      title={section.title ? t(section.title) : undefined}
      description={section.description ? t(section.description) : undefined}
      collapsible={section.collapsible}
      defaultOpen={section.defaultOpen}
    >
      <FieldGrid fields={sectionFields} layout={section.layout} />
    </slots.Section>
  );
}

export function StepBody({ step }: { step: Step }) {
  if (step.sections && step.sections.length) {
    const claimed = new Set(step.sections.flatMap((s) => s.fields));
    const leftover = step.fields.filter((f) => !claimed.has(f.name));
    return (
      <div className="fr-step-body">
        {step.sections.map((s) => (
          <SectionView key={s.id} section={s} fields={step.fields} />
        ))}
        {leftover.length > 0 && <FieldGrid fields={leftover} />}
      </div>
    );
  }

  return (
    <div className="fr-step-body">
      <FieldGrid fields={step.fields} layout={step.layout} />
    </div>
  );
}
