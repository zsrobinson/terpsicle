import { track } from "./analytics";
import { PRODUCTS, type ProductId } from "./products";

// Links between products read "View …" (decisions.md, "Copy"; V3.md §1.2),
// and each counts itself: which product led where, nothing else.

/** What a link into a product says: "View schedule", "View todos". */
export function viewWords(to: ProductId): string {
  // PRODUCTS lists every ProductId.
  return PRODUCTS.find((p) => p.id === to)?.view ?? "";
}

/** Records a "View …" link followed (V3.md §6): the two product ids only. */
export function crossLinkClicked(from: ProductId, to: ProductId): void {
  track("cross_link_clicked", { from, to });
}
