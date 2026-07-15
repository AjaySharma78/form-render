import { useMemo } from "react";
import type { Field, LayoutRow } from "../types";
import { widthToSpan } from "../utils/cn";
import { useFormRenderContext } from "./context";
import { FieldRenderer } from "./FieldRenderer";

/**
 * Render a set of fields either by explicit layout rows or by flow (per-field
 * width). `namePrefix` scopes the fields to an array row ("contacts.0").
 * The column count comes from settings.columns (default 12).
 */
export function FieldGrid({
  fields,
  layout,
  namePrefix,
}: {
  fields: readonly Field[];
  layout?: readonly LayoutRow[];
  namePrefix?: string;
}) {
  const { slots, columns } = useFormRenderContext();
  const { Grid, Cell } = slots;
  const byName = useMemo(() => new Map(fields.map((f) => [f.name, f])), [fields]);

  const cells =
    layout && layout.length
      ? // explicit layout: distribute the columns evenly across each row's
        // fields, unless a cell gives an explicit span or the field a width.
        layout.flatMap((row) => {
          const even = Math.max(1, Math.floor(columns / row.length));
          return row.map((cell) => {
            const name = typeof cell === "string" ? cell : cell.field;
            const explicitSpan = typeof cell === "string" ? undefined : cell.span;
            const field = byName.get(name);
            if (!field) return null;
            const span =
              explicitSpan ?? (field.width != null ? widthToSpan(field.width, columns) : even);
            return { field, span };
          });
        })
      : // flow layout: each field uses its own width (default full).
        fields.map((field) => ({ field, span: widthToSpan(field.width, columns) }));

  return (
    <Grid columns={columns}>
      {cells.map((c) =>
        c ? (
          <Cell key={c.field.name} span={c.span}>
            <FieldRenderer field={c.field} namePrefix={namePrefix} />
          </Cell>
        ) : null,
      )}
    </Grid>
  );
}
