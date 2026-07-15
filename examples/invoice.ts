/**
 * Invoice example — repeatable line items with per-row computed totals and a
 * computed grand total (v2 arrays + computed fields working together).
 *
 *   <FormRender
 *     schema={invoiceSchema}
 *     components={htmlComponents}
 *     formulas={invoiceFormulas}
 *     onSubmit={save}
 *   />
 */
import { defineSchema } from "../src/infer";
import type { FormulaMap } from "../src/types";

export const invoiceSchema = defineSchema({
  id: "invoice",
  version: 1,
  title: "Invoice",
  fields: [
    { name: "customer", type: "text", label: "Customer", validation: { required: { message: "Required" } } },
    { name: "taxRate", type: "number", label: "Tax rate (%)", default: 18, width: "third" },
    {
      name: "items",
      type: "array",
      label: "Line items",
      addText: "Add item",
      defaultItems: 1,
      sortable: true,
      item: {
        fields: [
          { name: "description", type: "text", label: "Description", validation: { required: { message: "Required" } } },
          { name: "qty", type: "number", label: "Qty", default: 1, min: 0 },
          { name: "price", type: "number", label: "Unit price", default: 0, min: 0 },
          {
            name: "lineTotal",
            type: "number",
            label: "Total",
            // row-relative inputs; recomputed the moment qty/price change
            computed: { formula: "lineTotal", inputs: ["qty", "price"] },
          },
        ],
        layout: [["description"], ["qty", "price", "lineTotal"]],
      },
      validation: { minItems: { value: 1, message: "Add at least one item" } },
    },
    {
      name: "grandTotal",
      type: "number",
      label: "Grand total",
      // whole-array input + a root field; reruns on any row change
      computed: { formula: "grandTotal", inputs: ["items", "taxRate"] },
    },
  ],
});

type Row = { qty?: number; price?: number };

export const invoiceFormulas: FormulaMap = {
  lineTotal: ({ qty, price }) => (Number(qty) || 0) * (Number(price) || 0),
  grandTotal: ({ items, taxRate }) => {
    const rows = (items as Row[]) ?? [];
    const net = rows.reduce((sum, r) => sum + (Number(r.qty) || 0) * (Number(r.price) || 0), 0);
    return Math.round(net * (1 + (Number(taxRate) || 0) / 100) * 100) / 100;
  },
};
