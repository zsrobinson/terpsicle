import { ArrowUp, Info } from "lucide-react";
import { type KeyboardEvent, useId, useMemo, useRef, useState } from "react";
import { MODERATION_POLICY, precheck, REASON_WORDS } from "~/core/moderation";
import { CHAT_TEXT_MAX } from "~/core/schema";
import { Button } from "~/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/ui/popover";
import { WithTooltip } from "~/ui/tooltip";

// The composer (V2.md §8.6): plain text, Enter to send and Shift+Enter for a
// new line. What the rules would hold shows under it as a quiet line before
// you send, never as an error, and "What's allowed" is one tap away.

/** Show how much room is left once it's this little. */
const SHOW_LEFT = 200;

export function Composer({
  placeholder,
  label,
  disabledReason,
  onSend,
  onTyping,
}: {
  placeholder: string;
  /** The field's accessible name: "Message CMSC351 · everyone". */
  label: string;
  /** Why you can't write here (read-only), or null. */
  disabledReason: string | null;
  onSend: (text: string) => void;
  onTyping: () => void;
}) {
  const [draft, setDraft] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const text = draft.trim();
  // Only what would hold or remove it: flags never stop a message.
  const hint = useMemo(() => {
    if (!text) return null;
    const reason = precheck({ kind: "chat", text }).find(
      (r) => r.action !== "flag",
    );
    return reason ? REASON_WORDS[reason.code] : null;
  }, [text]);

  if (disabledReason)
    return (
      <p className="border-hairline border-t px-4 py-3 text-muted text-sm">
        {disabledReason}
      </p>
    );

  const send = () => {
    if (!text) return;
    onSend(text);
    setDraft("");
    field.current?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };
  const left = CHAT_TEXT_MAX - draft.length;

  return (
    <div className="border-hairline border-t px-4 pt-2 pb-3">
      <div className="flex items-end gap-2">
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <textarea
          id={id}
          ref={field}
          value={draft}
          placeholder={placeholder}
          maxLength={CHAT_TEXT_MAX}
          rows={Math.min(6, draft.split("\n").length)}
          onChange={(e) => {
            setDraft(e.target.value);
            if (e.target.value.trim()) onTyping();
          }}
          onKeyDown={onKeyDown}
          className="min-h-9 w-full flex-1 resize-none border border-hairline-strong bg-bg px-2 py-1.5 text-base text-fg placeholder:text-faint focus-visible:border-fg max-md:min-h-11"
        />
        <WithTooltip label="Send" shortcut="↵">
          <Button
            size="icon"
            aria-label="Send"
            disabled={!text}
            onClick={send}
            className="max-md:size-11"
          >
            <ArrowUp />
          </Button>
        </WithTooltip>
      </div>
      <div className="mt-1 flex min-h-4 items-center gap-3 text-muted text-xs">
        <Allowed />
        {hint ? (
          <span role="status" className="min-w-0 truncate">
            {hint}. A person may check it before classmates see it.
          </span>
        ) : null}
        {left <= SHOW_LEFT ? (
          <span className="tnum ml-auto shrink-0">{left} left</span>
        ) : null}
      </div>
    </div>
  );
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
