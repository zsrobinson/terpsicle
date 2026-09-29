import { ChevronDown } from "lucide-react";
import { type TermTags, termTagOf } from "~/core/catalog/term-tag";
import { shortTermName } from "~/core/catalog/terms";
import type { Term } from "~/core/schema";
import {
  ActionMenu,
  ActionMenuRadioGroup,
  ActionMenuRadioItem,
  ActionMenuSeparator,
} from "~/ui/action-menu";
import { TermTag } from "~/ui/term-tag";
import { useChatHome } from "./chat-home";

// Chat's context in the family bar (docs/COHESION.md §4): the term whose
// rooms you're in, after the divider, the way the scheduler shows its term,
// tagged Now or Next (V2 §5.5) the same way too.
// With one term there's nothing to pick, so it's just the name. The menu
// is the kit's ActionMenu, a sheet on a phone. On a phone the bar moves
// Feedback into the account menu to make room; on the very narrowest the
// name still gives way rather than run into the account.

export function ChatTermMenu() {
  const terms = useChatHome((s) => s.terms);
  const termId = useChatHome((s) => s.termId);
  const tags = useChatHome((s) => s.tags);
  const term = terms.find((t) => t.id === termId);
  if (!term) return null;
  if (terms.length < 2)
    return (
      <span className="flex min-w-0 items-center gap-1.5 px-1.5 text-base text-muted max-md:px-0">
        <span className="truncate">{term.name}</span>
        <TermTag tag={termTagOf(term.id, tags)} />
      </span>
    );
  const active = terms.filter((t) => t.status === "active");
  const past = terms.filter((t) => t.status !== "active");
  const pick = (next: string) => void useChatHome.getState().setTerm(next);
  return (
    <ActionMenu
      title="Terms"
      tooltip="Show another term's classes"
      className="min-w-[200px]"
      trigger={
        <button
          type="button"
          aria-label={`Term: ${term.name}`}
          className="flex h-7 min-w-0 items-center gap-1 px-1.5 text-base text-muted transition-colors hover:bg-hover hover:text-fg data-popup-open:bg-hover data-popup-open:text-fg max-md:h-11 max-md:px-1"
        >
          {/* A phone says "Spring ’27", so the name and its tag read whole. */}
          <span className="truncate max-sm:hidden">{term.name}</span>
          <span
            aria-hidden="true"
            className="hidden whitespace-nowrap max-sm:inline"
          >
            {shortTermName(term.name)}
          </span>
          <TermTag tag={termTagOf(term.id, tags)} className="ml-0.5" />
          {/* On a phone a tagged term ends at its tag, so its name reads whole. */}
          <ChevronDown
            size={12}
            aria-hidden="true"
            className={termTagOf(term.id, tags) ? "max-sm:hidden" : undefined}
          />
        </button>
      }
    >
      <ActionMenuRadioGroup value={term.id} onValueChange={pick}>
        {active.map((t) => (
          <TermItem key={t.id} term={t} tags={tags} />
        ))}
      </ActionMenuRadioGroup>
      {past.length > 0 ? (
        <>
          <ActionMenuSeparator />
          <ActionMenuRadioGroup
            label="Past terms"
            value={term.id}
            onValueChange={pick}
          >
            {past.map((t) => (
              <TermItem key={t.id} term={t} tags={tags} />
            ))}
          </ActionMenuRadioGroup>
        </>
      ) : null}
    </ActionMenu>
  );
}

function TermItem({ term, tags }: { term: Term; tags: TermTags }) {
  return (
    <ActionMenuRadioItem value={term.id}>
      <span className="flex items-center gap-2">
        {term.name}
        <TermTag tag={termTagOf(term.id, tags)} />
      </span>
    </ActionMenuRadioItem>
  );
}
