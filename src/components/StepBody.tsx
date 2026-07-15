import { useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import type { Field, FormValues, Section, Step } from "../types";
import { evaluateVisibility, extractDeps } from "../engine/condition";
import { useFormRenderContext } from "./context";
import { FieldGrid } from "./FieldGrid";

function SectionView({ section, fields }: { section: Section; fields: readonly Field[] }) {
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
