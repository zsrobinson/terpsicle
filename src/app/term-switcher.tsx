import { ChevronDown } from "lucide-react";
import type { Term } from "~/core/schema";
import { useActiveTerm } from "~/state/hooks";
import { useShare } from "~/state/share-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/ui/dropdown-menu";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { switchTerm } from "./actions";

/**
 * `/ Spring 2027 ▾`: every term Testudo lists, then archived ones under
 * "Past terms" (SPEC §3.0). Read-only while a shared plan is open, since the
 * link decides the term.
 */
export function TermSwitcher() {
  const { term, terms } = useActiveTerm();
  const sharing = useShare((s) => s.shared !== null);

  if (!terms || !term) return <Skeleton className="h-4 w-20" />;
  if (sharing)
    return <span className="px-1.5 text-base text-muted">{term.name}</span>;

  const active = terms.filter((t) => t.status === "active");
  const past = terms.filter((t) => t.status === "archived");
  const pick = (id: string) => {
    const next = terms.find((t) => t.id === id);
    if (next) switchTerm(next);
  };

  return (
    <DropdownMenu>
      <WithTooltip label="Switch term">
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-base text-muted transition-colors hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg"
          >
            {term.name}
            <ChevronDown size={12} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
      </WithTooltip>
      <DropdownMenuContent className="min-w-[200px]">
        <DropdownMenuRadioGroup value={term.id} onValueChange={pick}>
          {active.map((t) => (
            <TermItem key={t.id} term={t} />
          ))}
          {past.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Past terms</DropdownMenuLabel>
              {past.map((t) => (
                <TermItem key={t.id} term={t} />
              ))}
            </>
          ) : null}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TermItem({ term }: { term: Term }) {
  return (
    <DropdownMenuRadioItem value={term.id}>
      <span className="flex-1">{term.name}</span>
      {term.status === "archived" ? (
        <span className="text-xs text-faint">Seats frozen</span>
      ) : null}
    </DropdownMenuRadioItem>
  );
}
