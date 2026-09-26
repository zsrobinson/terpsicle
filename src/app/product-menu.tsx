import { cn } from "cn";
import { Check, ChevronsUpDown } from "lucide-react";
import { STAY_PARAM } from "~/core/routing";
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
import { PRODUCTS, type Product, type ProductId } from "./products";

// The product menu, the brand's app switcher (docs/V2.md §1.1, DESIGN.md
// §7.6): the umbrella and the wordmark, top left, open the three products
// with their marks. The one you're in wears its soft color and a check. No
// paths, counts or badges: nothing here pulls you into another product.
// Then the marketing page at `/?stay`, which returning visitors would
// otherwise skip. Plain links: the shell also renders outside a router
// (tests), and `/`'s head script needs a full load to see ?stay.

const CURRENT: Record<ProductId, string> = {
  schedule:
    "bg-product-schedule-soft data-highlighted:bg-product-schedule-soft",
  reviews: "bg-product-reviews-soft data-highlighted:bg-product-reviews-soft",
  chat: "bg-product-chat-soft data-highlighted:bg-product-chat-soft",
};

export function ProductMenu({
  compact = false,
  current = "schedule",
}: {
  compact?: boolean;
  current?: ProductId;
}) {
  return (
    <DropdownMenu>
      <WithTooltip label="Switch product">
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="-mx-1 flex h-8 shrink-0 items-center gap-2 px-1 transition-colors hover:bg-hover data-[state=open]:bg-hover"
          >
            <Mark id="umbrella" size={20} label="Terpsicle" />
            {/* A phone keeps the width for the open plan's name. */}
            {compact ? null : (
              <>
                <Wordmark />
                <ChevronsUpDown
                  size={12}
                  aria-hidden="true"
                  className="text-muted"
                />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
      </WithTooltip>
      <DropdownMenuContent className="w-[248px]">
        {PRODUCTS.map((product) => (
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
      {/* size-7: menu items shrink unsized icons to 14px. */}
      <Mark id={product.id} size={28} className="size-7" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{product.label}</span>
        <span className="block truncate text-muted text-xs">
          {product.hint}
        </span>
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
