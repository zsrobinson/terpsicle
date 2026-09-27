import { track } from "./analytics";
import { PRODUCTS, type ProductId } from "./products";

// Links between products read "View …" (decisions.md, "Copy"; V3.md §1.2),
// and each counts itself: which product led where, nothing else.

// Fails to compile if PRODUCTS ever leaves a product out, so the lookup
// below always has words.
const EVERY_PRODUCT_LISTED: [ProductId] extends [
  (typeof PRODUCTS)[number]["id"],
]
  ? true
  : never = true;
void EVERY_PRODUCT_LISTED;

const VIEW_WORDS = Object.fromEntries(
  PRODUCTS.map((p) => [p.id, p.view]),
) as Record<ProductId, string>;

/** What a link into a product says: "View schedule", "View todos". */
export function viewWords(to: ProductId): string {
  return VIEW_WORDS[to];
}

/** Records a "View …" link followed (V3.md §6): the two product ids only. */
export function crossLinkClicked(from: ProductId, to: ProductId): void {
  track("cross_link_clicked", { from, to });
}
