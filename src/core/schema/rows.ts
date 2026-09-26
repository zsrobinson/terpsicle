import type { z } from "zod";

/**
 * Rows read from the browser's storage, validated one by one: an invalid row
 * is skipped and logged, never fatal (DATA.md §5), so one bad write can't
 * lock someone out of their plans.
 */
export function validRows<S extends z.ZodType>(
  table: string,
  schema: S,
  rows: readonly unknown[],
): z.infer<S>[] {
  const out: z.infer<S>[] = [];
  for (const row of rows) {
    const parsed = schema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
    else console.warn(`Skipped an invalid ${table} row`, row, parsed.error);
  }
  return out;
}
