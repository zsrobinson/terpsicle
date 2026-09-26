import { STAY_PARAM } from "~/core/routing";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemText,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/ui/dropdown-menu";
import { WithTooltip } from "~/ui/tooltip";
import { Logo } from "./logo";
import { PRODUCTS } from "./products";

// The logo opens the product menu (docs/V2.md §1.1, "Getting between
// products"): the scheduler, Reviews and Chat, plus the marketing page at
// `/?stay`, which returning visitors would otherwise skip. Plain links: the
// shell also renders outside a router (tests), and `/`'s head script needs a
// full load to see ?stay.

export function ProductMenu({ compact = false }: { compact?: boolean }) {
  return (
    <DropdownMenu>
      <WithTooltip label="Schedule, Reviews and Chat">
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex shrink-0 items-center rounded-md p-0.5 transition-colors hover:bg-hover data-[state=open]:bg-hover"
          >
            <Logo compact={compact} />
          </button>
        </DropdownMenuTrigger>
      </WithTooltip>
      <DropdownMenuContent align="start" className="min-w-[200px]">
        {PRODUCTS.map((p) => (
          <DropdownMenuItem key={p.to} asChild>
            <a href={p.to}>
              <DropdownMenuItemText label={p.label} hint={p.hint} />
            </a>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={`/?${STAY_PARAM}`}>About Terpsicle</a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
