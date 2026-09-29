import { ChevronsUpDown } from "lucide-react";
import { STAY_PARAM } from "~/core/routing";
import { useAccount } from "~/features/auth/account-store";
import { listedProducts, PRODUCTS, type ProductId } from "~/lib/products";
import {
  ActionMenu,
  ActionMenuLinkItem,
  ActionMenuSeparator,
  ActionMenuText,
} from "~/ui/action-menu";
import { Mark } from "./brand/mark";
import { Wordmark } from "./brand/wordmark";
import { EARLY_ACCESS, EARLY_ACCESS_NOTE } from "./early-access";

// The product menu, the brand's app switcher (docs/V2.md §1.1, DESIGN.md
// §7.6): where the bar is too narrow for the product tabs (app-bar.tsx),
// from `md` to 1100px, the umbrella and the product you're in open the
// products with their marks; below `md` the phone's tab bar takes its place
// (~/components/tab-bar), except on pages without one (sign-in, admin,
// `/privacy`), where it's the kit's action menu as a sheet. The one you're
// in wears its soft color and a check. No paths, counts or badges: nothing
// here pulls you into another product. Then the marketing page at `/?stay`,
// which returning visitors would otherwise skip, and the "Early access"
// note (the bar's chip, which narrower bars don't show). Plain links: the
// shell also renders outside a router (tests), and `/`'s head script needs a
// full load to see ?stay.

const CURRENT: Record<ProductId, string> = {
  schedule:
    "bg-product-schedule-soft data-highlighted:bg-product-schedule-soft",
  reviews: "bg-product-reviews-soft data-highlighted:bg-product-reviews-soft",
  chat: "bg-product-chat-soft data-highlighted:bg-product-chat-soft",
  plan: "bg-product-plan-soft data-highlighted:bg-product-plan-soft",
  todo: "bg-product-todo-soft data-highlighted:bg-product-todo-soft",
};

export function ProductMenu({
  compact = false,
  current,
}: {
  compact?: boolean;
  /** The product you're in; null on Settings and the site's own pages. */
  current: ProductId | null;
}) {
  const flags = useAccount((s) => s.flags);
  const here = PRODUCTS.find((p) => p.id === current) ?? null;
  return (
    <ActionMenu
      title="Products"
      tooltip="Switch product"
      className="w-[248px]"
      trigger={
        <button
          type="button"
          className="-mx-1 flex h-8 shrink-0 items-center gap-2 px-1 transition-colors hover:bg-hover data-popup-open:bg-hover"
        >
          <Mark id="umbrella" size={20} label="Terpsicle" />
          {/* The scheduler's phone bar keeps its width for the term and
              the plan's name: the umbrella alone opens the menu there. */}
          {compact ? null : <Wordmark />}
          {here && !compact ? (
            <>
              <span aria-hidden="true" className="text-faint">
                /
              </span>
              <Mark id={here.id} size={20} />
              <span className="font-semibold text-base">{here.label}</span>
            </>
          ) : null}
          <ChevronsUpDown size={12} aria-hidden="true" className="text-muted" />
        </button>
      }
    >
      {listedProducts(flags, current).map((product) => (
        <ActionMenuLinkItem
          key={product.id}
          href={product.to}
          current={product.id === current}
          currentClassName={CURRENT[product.id]}
          hint={product.hint}
          // Sized: menu items shrink unsized icons to 14px. 30px is 3px units.
          icon={<Mark id={product.id} size={30} className="size-7.5" />}
        >
          <span className="font-semibold">{product.label}</span>
        </ActionMenuLinkItem>
      ))}
      <ActionMenuSeparator />
      <AboutItems />
    </ActionMenu>
  );
}

/**
 * About Terpsicle and the Early access note: the product menu's foot, and
 * the account menu's on a phone, where the tab bar has taken the product
 * menu's place.
 */
export function AboutItems() {
  return (
    <>
      <ActionMenuLinkItem
        href={`/?${STAY_PARAM}`}
        tooltip="What Terpsicle is, for first visits"
      >
        About Terpsicle
      </ActionMenuLinkItem>
      <ActionMenuText className="pt-1 text-xs">
        <span className="font-medium text-fg">{EARLY_ACCESS}:</span>{" "}
        {EARLY_ACCESS_NOTE}
      </ActionMenuText>
    </>
  );
}
