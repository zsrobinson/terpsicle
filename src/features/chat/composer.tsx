import { cn } from "cn";
import { ArrowUp, Info } from "lucide-react";
import {
  type KeyboardEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PanelNote } from "~/components/panel";
import {
  insertMention,
  type Mentionable,
  mentionDraft,
  mentionMatches,
} from "~/core/chat";
import { answersHint, MODERATION_POLICY } from "~/core/moderation";
import { CHAT_TEXT_MAX } from "~/core/schema";
import { Button } from "~/ui/button";
import { Textarea } from "~/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "~/ui/popover";
import { WithTooltip } from "~/ui/tooltip";

// The composer (V2.md §8.6): plain text, Enter to send and Shift+Enter for a
// new line, and "What's allowed" one tap away. Nothing here says a message
// will be checked (the owner, 2026-09-27). The one exception is a plain
// note, shown once per browser, when a draft looks like answers to graded
// work: a fact, not a lecture (2026-09-28); it never stops the message.
// It's there while the room connects too: a send then waits in the session
// and goes once the room's open. Typing "@" offers the room's members
// (loaded the first time), and picking one writes their full name, which is
// how the object finds who to notify.

/** Show how much room is left once it's this little. */
const SHOW_LEFT = 200;

/** The graded-answers nudge, once per browser (it's a nudge, not a rule). */
const ANSWERS_HINT_KEY = "terpsicle:chat-answers-hint-seen";

export const ANSWERS_HINT =
  "This reads like answers to graded work, and your name goes on it.";

function answersHintSeen(): boolean {
  try {
    return localStorage.getItem(ANSWERS_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

function markAnswersHintSeen(): void {
  try {
    localStorage.setItem(ANSWERS_HINT_KEY, "1");
  } catch {
    // Storage blocked: the nudge may show once more, which is fine.
  }
}

export function Composer({
  placeholder,
  label,
  disabledReason,
  onSend,
  onTyping,
  loadMembers,
}: {
  placeholder: string;
  /** The field's accessible name: "Message CMSC351 · everyone". */
  label: string;
  /** Why you can't write here (read-only), or null. */
  disabledReason: string | null;
  onSend: (text: string) => void;
  onTyping: () => void;
  /** The room's members, for @-mentions; without it, no autocomplete. */
  loadMembers?: () => Promise<readonly Mentionable[]>;
}) {
  const [draft, setDraft] = useState("");
  const [caret, setCaret] = useState(0);
  const field = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const text = draft.trim();
  const mentions = useMentions(draft, caret, loadMembers);
  // Where the caret goes after a mention is put in, once React has the text.
  const placeCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const at = placeCaret.current;
    if (at === null || !field.current) return;
    placeCaret.current = null;
    field.current.setSelectionRange(at, at);
    setCaret(at);
  });
  const [hintSeen, setHintSeen] = useState(answersHintSeen);
  const hint = useMemo(
    () => !hintSeen && !!text && answersHint(text),
    [hintSeen, text],
  );

  if (disabledReason)
    return (
      <PanelNote className="border-hairline border-t">
        {disabledReason}
      </PanelNote>
    );

  const send = () => {
    if (!text) return;
    // Seen once, it's done its job; the message goes either way.
    if (hint) {
      markAnswersHintSeen();
      setHintSeen(true);
    }
    onSend(text);
    setDraft("");
    field.current?.focus();
  };
  const pick = (who: Mentionable) => {
    if (!mentions.draft) return;
    const next = insertMention(draft, mentions.draft, caret, who.name);
    // The name is in: its "@" offers nothing more.
    mentions.dismiss();
    setDraft(next.text);
    placeCaret.current = next.caret;
    field.current?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentions.open && !e.nativeEvent.isComposing) {
      const n = mentions.matches.length;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        mentions.setActive(
          (mentions.active + (e.key === "ArrowDown" ? 1 : n - 1)) % n,
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const who = mentions.matches[mentions.active];
        if (who) pick(who);
        return;
      }
      if (e.key === "Escape") {
        // Closes the list only; the view's Esc waits for the next one.
        e.preventDefault();
        e.stopPropagation();
        mentions.dismiss();
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };
  const left = CHAT_TEXT_MAX - draft.length;

  const listId = `${id}-mentions`;
  const optionId = (i: number) => `${id}-mention-${i}`;
  return (
    <div className="relative border-hairline border-t px-4 pt-2 pb-3">
      {mentions.open ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Mention someone in this room"
          className="absolute right-4 bottom-full left-4 z-20 mb-1 max-w-80 overflow-hidden border border-keyline bg-raised py-1 shadow-pop"
        >
          {mentions.matches.map((who, i) => (
            <div
              key={who.directoryId}
              id={optionId(i)}
              role="option"
              tabIndex={-1}
              aria-selected={i === mentions.active}
              // Before the field's blur, so the pick lands in the draft.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => mentions.setActive(i)}
              onClick={() => pick(who)}
              onKeyDown={() => {}}
              // Classmates' names: boxed out of feedback screenshots.
              data-private=""
              className={cn(
                "cursor-default truncate px-3 py-1.5 text-fg text-sm max-md:py-3",
                i === mentions.active && "bg-hover",
              )}
            >
              {who.name}
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <Textarea
          id={id}
          ref={field}
          value={draft}
          placeholder={placeholder}
          maxLength={CHAT_TEXT_MAX}
          rows={Math.min(6, draft.split("\n").length)}
          onChange={(e) => {
            setDraft(e.target.value);
            setCaret(e.target.selectionStart);
            if (e.target.value.trim()) onTyping();
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          aria-autocomplete={loadMembers ? "list" : undefined}
          aria-controls={mentions.open ? listId : undefined}
          aria-activedescendant={
            mentions.open ? optionId(mentions.active) : undefined
          }
          className="min-h-8 flex-1 resize-none max-md:min-h-11"
        />
        <WithTooltip label="Send" shortcut="↵">
          <Button size="icon" aria-label="Send" disabled={!text} onClick={send}>
            <ArrowUp />
          </Button>
        </WithTooltip>
      </div>
      <div className="mt-1 flex min-h-4 items-center gap-3 text-muted text-xs">
        <Allowed />
        {hint ? (
          <span role="status" className="min-w-0">
            {ANSWERS_HINT}
          </span>
        ) : null}
        {left <= SHOW_LEFT ? (
          <span className="tnum ml-auto shrink-0">{left} left</span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The mention being typed and the members it matches. Members load the
 * first time an "@" is typed; Esc closes the list until the next "@".
 */
function useMentions(
  text: string,
  caret: number,
  load: (() => Promise<readonly Mentionable[]>) | undefined,
) {
  const [members, setMembers] = useState<readonly Mentionable[] | null>(null);
  const [selected, setSelected] = useState({ key: "", index: 0 });
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const draft = load ? mentionDraft(text, caret) : null;
  const loadRef = useRef(load);
  loadRef.current = load;
  const wanted = draft !== null && members === null;
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    loadRef
      .current?.()
      .then((list) => {
        if (live) setMembers(list);
      })
      .catch(() => {
        // No list this time; the next "@" tries again.
      });
    return () => {
      live = false;
    };
  }, [wanted]);
  const matches = draft && members ? mentionMatches(members, draft.query) : [];
  const open =
    draft !== null && matches.length > 0 && dismissedAt !== draft.start;
  // The highlight starts at the top again whenever the query changes.
  const key = draft ? `${draft.start}:${draft.query}` : "";
  return {
    draft,
    matches,
    open,
    active:
      selected.key === key ? Math.min(selected.index, matches.length - 1) : 0,
    setActive: (index: number) => setSelected({ key, index }),
    dismiss: () => setDismissedAt(draft?.start ?? null),
  };
}

/** "What's allowed": chat's rules, in the words reviews use too. */
export function Allowed() {
  const policy = MODERATION_POLICY.chat;
  return (
    <Popover>
      <WithTooltip label="Chat's rules">
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex shrink-0 items-center gap-1 underline-offset-2 hover:text-fg hover:underline max-md:min-h-11"
          >
            <Info size={12} aria-hidden="true" />
            {policy.title}
          </button>
        </PopoverTrigger>
      </WithTooltip>
      <PopoverContent align="start" className="w-80 text-sm">
        <p className="mb-2">{policy.intro}</p>
        {policy.sections.map((section) => (
          <div key={section.heading} className="mb-2">
            <h3 className="font-semibold">{section.heading}</h3>
            <ul className="list-disc pl-4 text-muted">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
        <p className="text-muted">{policy.process}</p>
      </PopoverContent>
    </Popover>
  );
}
