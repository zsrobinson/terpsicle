import { cn } from "cn";
import { Check, ChevronsUpDown } from "lucide-react";
import { STAY_PARAM } from "~/core/routing";
import { useAccount } from "~/features/auth/account-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/ui/dropdown-menu";
import { WithTooltip } from "~/ui/tooltip";
import { Mark } from "./brand/mark";
import { Wordmark } from "./brand/wordmark";
import { EARLY_ACCESS, EARLY_ACCESS_NOTE } from "./early-access";
import {
  listedProducts,
  PRODUCTS,
  type Product,
  type ProductId,
} from "./products";

// The product menu, the brand's app switcher (docs/V2.md §1.1, DESIGN.md
// §7.6): where the bar is too narrow for the product tabs (app-bar.tsx),
// the umbrella and the product you're in open the products with their
// marks. The one you're in wears its soft color and a check. No
// paths, counts or badges: nothing here pulls you into another product.
// Then the marketing page at `/?stay`, which returning visitors would
// otherwise skip, and the "Early access" note (the bar's chip, which
// phones don't show). Plain links: the shell also renders outside a router
// (tests), and `/`'s head script needs a full load to see ?stay.

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
    <DropdownMenu>
      <WithTooltip label="Switch product">
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="-mx-1 flex h-8 shrink-0 items-center gap-2 px-1 transition-colors hover:bg-hover data-[state=open]:bg-hover"
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
            <ChevronsUpDown
              size={12}
              aria-hidden="true"
              className="text-muted"
            />
          </button>
        </DropdownMenuTrigger>
      </WithTooltip>
      <DropdownMenuContent className="w-[248px]">
        {listedProducts(flags, current).map((product) => (
          <ProductItem
            key={product.id}
            product={product}
            current={product.id === current}
          />
        ))}
        <DropdownMenuSeparator />
        <WithTooltip label="What Terpsicle is, for first visits" side="right">
          <DropdownMenuItem asChild>
            <a href={`/?${STAY_PARAM}`}>About Terpsicle</a>
          </DropdownMenuItem>
        </WithTooltip>
        <p className="px-2 pt-1 pb-1.5 text-muted text-xs">
          <span className="font-medium text-fg">{EARLY_ACCESS}:</span>{" "}
          {EARLY_ACCESS_NOTE}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProductItem({
  product,
  current,
}: {
  product: Product;
  current: boolean;
}) {
  const body = (
    <>
      {/* Sized: menu items shrink unsized icons to 14px. 30px is 3px units. */}
      <Mark id={product.id} size={30} className="size-7.5" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{product.label}</span>
        <span className="block text-muted text-xs">{product.hint}</span>
      </span>
      {current ? <Check aria-hidden="true" /> : null}
    </>
  );
  return (
    <WithTooltip label={product.view} side="right">
      {current ? (
        // You're already here: choosing it just closes the menu.
        <DropdownMenuItem
          aria-current="page"
          className={cn("py-1.5", CURRENT[product.id])}
        >
          {body}
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem asChild className="py-1.5">
          <a href={product.to}>{body}</a>
        </DropdownMenuItem>
      )}
    </WithTooltip>
  );
}
