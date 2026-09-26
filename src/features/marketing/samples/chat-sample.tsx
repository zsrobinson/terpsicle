import { SendHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { SampleCard, type SampleProps } from "./sample";

// A section's chat with sample classmates: messages arrive one at a time
// once the card is on screen, and you can send a reply. Someone answers. It
// never leaves the page: nothing is sent anywhere.

interface Message {
  id: number;
  who: string;
  initials: string;
  when: string;
  text: string;
  tone: "a" | "b" | "c" | "me";
}

const ROOM = { course: "CMSC351", section: "0301", people: 27 };

const ARRIVING: Omit<Message, "id">[] = [
  {
    who: "Maya Okafor",
    initials: "MO",
    when: "2:14 pm",
    text: "Is the Friday discussion in CSI 1115 or 1122 this week?",
    tone: "a",
  },
  {
    who: "Devin Ruiz",
    initials: "DR",
    when: "2:16 pm",
    text: "1122. It moved after week 2, Testudo still says 1115.",
    tone: "b",
  },
  {
    who: "Maya Okafor",
    initials: "MO",
    when: "2:16 pm",
    text: "Thanks. Is the problem set due before or after that?",
    tone: "a",
  },
  {
    who: "Priya Nair",
    initials: "PN",
    when: "2:20 pm",
    text: "After, 11:59 pm. Ashdown said the last two questions are extra credit.",
    tone: "c",
  },
  {
    who: "Devin Ruiz",
    initials: "DR",
    when: "2:31 pm",
    text: "Anyone want to go over recurrences before the midterm?",
    tone: "b",
  },
  {
    who: "Priya Nair",
    initials: "PN",
    when: "2:32 pm",
    text: "Midterm study group in McKeldin, Sunday 2 pm. I'll post the room.",
    tone: "c",
  },
];

const REPLIES: Omit<Message, "id">[] = [
  {
    who: "Devin Ruiz",
    initials: "DR",
    when: "now",
    text: "Sounds good, see you there.",
    tone: "b",
  },
  {
    who: "Maya Okafor",
    initials: "MO",
    when: "now",
    text: "I'll bring the practice problems.",
    tone: "a",
  },
];

const AVATAR: Record<Message["tone"], string> = {
  a: "bg-product-chat-soft text-product-chat-text",
  b: "bg-product-reviews-soft text-product-reviews-text",
  c: "bg-product-schedule-soft text-product-schedule-text",
  me: "bg-accent text-accent-fg",
};

const ARRIVE_EVERY_MS = 1500;
const TYPING_MS = 700;

const ALL: Message[] = ARRIVING.map((m, id) => ({ ...m, id }));
/** The room already has an exchange going on the server render; two more come. */
const OPENING: Message[] = ALL.slice(0, 4);

export function ChatSample({ active, reduced }: SampleProps) {
  const [messages, setMessages] = useState<Message[]>(OPENING);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");
  const nextId = useRef(ARRIVING.length);
  const replies = useRef(0);
  const timers = useRef<number[]>([]);
  const inputId = useId();

  const later = (ms: number, fn: () => void) => {
    if (reduced) fn();
    else timers.current.push(window.setTimeout(fn, ms));
  };
  /** Someone types for a moment, then their message lands. */
  const arrive = (m: Omit<Message, "id">, typeMs: number) => {
    later(0, () => setTyping(true));
    later(typeMs, () => {
      setTyping(false);
      setMessages((list) => [...list, { ...m, id: nextId.current++ }]);
      setStatus(`${m.who}: ${m.text}`);
    });
  };

  // The conversation goes on when the card scrolls into view, and once.
  // Timers are cleared only on unmount, never on a re-render.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    if (reduced) {
      started.current = true;
      setMessages((list) => (list.length < ALL.length ? ALL : list));
      return;
    }
    if (!active) return;
    started.current = true;
    ALL.slice(OPENING.length).forEach((m, k) => {
      const at = 600 + k * ARRIVE_EVERY_MS;
      timers.current.push(window.setTimeout(() => setTyping(true), at));
      timers.current.push(
        window.setTimeout(() => {
          setTyping(false);
          setMessages((list) =>
            list.some((x) => x.id === m.id) ? list : [...list, m],
          );
        }, at + TYPING_MS),
      );
    });
  }, [active, reduced]);
  useEffect(
    () => () => {
      for (const t of timers.current) clearTimeout(t);
    },
    [],
  );

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((list) => [
      ...list,
      {
        id: nextId.current++,
        who: "You",
        initials: "You",
        when: "now",
        text,
        tone: "me",
      },
    ]);
    setDraft("");
    setStatus("Sent.");
    const reply = REPLIES[replies.current % REPLIES.length];
    replies.current += 1;
    if (reply) later(900, () => arrive(reply, TYPING_MS));
  };

  return (
    <SampleCard
      product="chat"
      title={
        <>
          <span className="font-mono">
            {ROOM.course} {ROOM.section}
          </span>{" "}
          <span className="font-normal text-muted">{ROOM.people} people</span>
        </>
      }
      status={status}
    >
      <ul
        aria-label={`Messages in ${ROOM.course} ${ROOM.section}`}
        className="mk-chat-log flex h-[232px] flex-col justify-end gap-3 overflow-hidden px-3 py-3"
      >
        {messages.map((m) => (
          <li key={m.id} className="mk-arrive flex items-start gap-3">
            <span
              aria-hidden="true"
              className={`flex size-7 shrink-0 items-center justify-center font-semibold text-2xs ${AVATAR[m.tone]}`}
            >
              {m.initials === "You" ? "Me" : m.initials}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-base">{m.who}</span>
                <span className="text-faint text-xs">{m.when}</span>
              </div>
              {/* Plain text, never HTML. */}
              <p className="text-base">{m.text}</p>
            </div>
          </li>
        ))}
        {typing ? (
          <li
            className="flex items-center gap-3 text-muted text-sm"
            aria-label="Someone is typing"
          >
            <span
              className="flex size-7 items-center justify-center gap-0.5"
              aria-hidden="true"
            >
              <span className="mk-dot size-1 rounded-full bg-muted" />
              <span className="mk-dot size-1 rounded-full bg-muted" />
              <span className="mk-dot size-1 rounded-full bg-muted" />
            </span>
            typing
          </li>
        ) : null}
      </ul>
      <form
        className="flex items-center gap-2 border-hairline border-t px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Message {ROOM.course} {ROOM.section}
        </label>
        <input
          id={inputId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Message ${ROOM.course} ${ROOM.section}`}
          autoComplete="off"
          maxLength={200}
          className="h-8 min-w-0 flex-1 border border-hairline-strong bg-bg px-2 text-base placeholder:text-faint focus-visible:border-fg focus-visible:outline-none"
        />
        <WithTooltip label="Send (stays on this page)" shortcut="↵">
          <Button
            type="submit"
            size="icon-sm"
            variant="outline"
            aria-label="Send"
            disabled={draft.trim() === ""}
          >
            <SendHorizontal aria-hidden="true" />
          </Button>
        </WithTooltip>
      </form>
    </SampleCard>
  );
}
