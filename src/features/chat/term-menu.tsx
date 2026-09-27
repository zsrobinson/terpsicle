import { ChevronDown } from "lucide-react";
import type { Term } from "~/core/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/ui/dropdown-menu";
import { WithTooltip } from "~/ui/tooltip";
import { useChatHome } from "./chat-home";

// Chat's context in the family bar (docs/COHESION.md §4): the term whose
// rooms you're in, after the divider, the way the scheduler shows its term.
// With one term there's nothing to pick, so it's just the name. On a phone
// the bar moves Feedback into the account menu to make room; on the very
// narrowest the name still gives way rather than run into the account.

export function ChatTermMenu() {
  const terms = useChatHome((s) => s.terms);
  const termId = useChatHome((s) => s.termId);
  const term = terms.find((t) => t.id === termId);
  if (!term) return null;
  if (terms.length < 2)
    return (
      <span className="min-w-0 truncate px-1.5 text-base text-muted max-md:px-0">
        {term.name}
      </span>
    );
  const active = terms.filter((t) => t.status === "active");
  const past = terms.filter((t) => t.status !== "active");
  return (
    <DropdownMenu>
      <WithTooltip label="Show another term's classes">
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Term: ${term.name}`}
            className="flex h-7 min-w-0 items-center gap-1 px-1.5 text-base text-muted transition-colors hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg max-md:h-11 max-md:px-1"
          >
            <span className="truncate">{term.name}</span>
            <ChevronDown size={12} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
      </WithTooltip>
      <DropdownMenuContent className="min-w-[200px]">
        <DropdownMenuRadioGroup
          value={term.id}
          onValueChange={(next) => void useChatHome.getState().setTerm(next)}
        >
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
    <DropdownMenuRadioItem value={term.id}>{term.name}</DropdownMenuRadioItem>
  );
}
