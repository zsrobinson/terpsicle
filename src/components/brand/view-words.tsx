import { viewWords } from "~/lib/cross-link";
import type { ProductId } from "~/lib/products";
import { Mark } from "./mark";

// What a link into another product says, with that product's mark before
// it (owner, 2026-09-29, for every product: integrations get their product
// icon, "for things like 'view in schedule'"). The mark is decoration: the
// words name the product. The link lays it out (inline-flex, a gap).

export function ViewWords({ to, size = 14 }: { to: ProductId; size?: number }) {
  return (
    <>
      <Mark id={to} size={size} className="shrink-0" />
      {viewWords(to)}
    </>
  );
}
