import { termTagOf } from "~/core/catalog/term-tag";
import { shortTermName, termLabel } from "~/core/catalog/terms";
import { TermTag } from "~/ui/term-tag";
import { useChatHome } from "./chat-home";

// Chat's context in the family bar (docs/COHESION.md §4): the term whose
// rooms you're in, after the divider, the way the scheduler shows its term,
// tagged Now or Next (V2 §5.5) the same way too. Chat has one term, the one
// in session (or between terms the next to start), so it's a name, not a
// menu (owner, 2026-09-29). On the very narrowest the name still gives way
// rather than run into the account.

export function ChatTermLabel() {
  const termId = useChatHome((s) => s.termId);
  const name = useChatHome((s) => s.terms.find((t) => t.id === s.termId)?.name);
  const tags = useChatHome((s) => s.tags);
  if (!termId) return null;
  const full = name ?? termLabel(termId);
  return (
    <span className="flex min-w-0 items-center gap-1.5 px-1.5 text-base text-muted max-md:px-1">
      {/* A phone says "Fall ’26", so the name and its tag read whole. */}
      <span className="truncate max-sm:hidden">{full}</span>
      <span className="hidden whitespace-nowrap max-sm:inline">
        {shortTermName(full)}
      </span>
      <TermTag tag={termTagOf(termId, tags)} />
    </span>
  );
}
