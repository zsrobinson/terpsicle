import { useEffect, useId, useRef, useState } from "react";
import { WithTooltip } from "~/ui/tooltip";
import { ChevronIcon, SendIcon, StarIcon } from "./icons";
import { type PreviewProps, SampleTag } from "./preview";

// A course chat with sample classmates: messages arrive one at a time, and
// you can send a reply. Someone answers, and your message gets a star. It
// never leaves the page: nothing is sent anywhere.

interface Message {
  id: number;
  initials: string;
  who: string;
  when: string;
  text: string;
  tone: "blue" | "violet" | "pink" | "me";
  stars?: number;
}

const ARRIVING: Omit<Message, "id">[] = [
  {
    initials: "MO",
    who: "Maya Okafor",
    when: "2:14pm",
    text: "Is the Thursday discussion in IRB 1116 or 1207 this week?",
    tone: "blue",
  },
  {
    initials: "DR",
    who: "Devin Ruiz",
    when: "2:16pm",
    text: "1207. It moved after week 2, Testudo still says 1116.",
    tone: "violet",
  },
  {
    initials: "PN",
    who: "Priya Nair",
    when: "2:31pm",
    text: "Midterm study group in McKeldin, Sunday 2pm. I'll post the room number.",
    tone: "pink",
  },
];

const REPLIES: Omit<Message, "id">[] = [
  {
    initials: "DR",
    who: "Devin Ruiz",
    when: "now",
    text: "Sounds good, see you there.",
    tone: "violet",
  },
  {
    initials: "MO",
    who: "Maya Okafor",
    when: "now",
    text: "I'll bring the practice problems.",
    tone: "blue",
  },
];

const AVATAR: Record<Message["tone"], string> = {
  blue: "mk-chat mk-soft mk-text",
  violet: "mk-reviews mk-soft mk-text",
  pink: "mk-schedule mk-soft mk-text",
  me: "bg-accent text-accent-fg",
};

const ROOMS = ["CMSC351", "A. Moreno", "0201", "0301"];

export function ChatPreview({ active, reduced, mark }: PreviewProps) {
  const [messages, setMessages] = useState<Message[]>(() =>
    reduced ? ARRIVING.map((m, id) => ({ ...m, id })) : [],
  );
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [said, setSaid] = useState("");
  const replies = useRef(0);
  const nextId = useRef(ARRIVING.length);
  const timers = useRef<number[]>([]);
  const inputId = useId();

  const later = (ms: number, fn: () => void) => {
    if (reduced) fn();
    else timers.current.push(window.setTimeout(fn, ms));
  };
  /** Someone types for a moment, then their message lands. */
  const arrive = (
    m: Omit<Message, "id">,
    typeMs: number,
    then?: () => void,
  ) => {
    if (reduced) {
      setMessages((list) => [...list, { ...m, id: nextId.current++ }]);
      then?.();
      return;
    }
    setTyping(true);
    later(typeMs, () => {
      setTyping(false);
      setMessages((list) => [...list, { ...m, id: nextId.current++ }]);
      then?.();
    });
  };

  // The conversation starts when it scrolls into view. `active` only ever
  // turns on, so this runs once (twice in development's strict mode, which
  // is why it cleans up after itself).
  useEffect(() => {
    if (reduced) {
      setMessages((list) =>
        list.length > 0 ? list : ARRIVING.map((m, id) => ({ ...m, id })),
      );
      return;
    }
    if (!active) return;
    // One at a time: someone types for a moment, then their message lands.
    const mine: number[] = [];
    ARRIVING.forEach((m, id) => {
      const at = 200 + id * 1600;
      mine.push(window.setTimeout(() => setTyping(true), at));
      mine.push(
        window.setTimeout(
          () => {
            setTyping(false);
            setMessages((list) =>
              list.some((x) => x.id === id) ? list : [...list, { ...m, id }],
            );
          },
          at + 900 + id * 200,
        ),
      );
    });
    return () => {
      for (const t of mine) window.clearTimeout(t);
    };
  }, [active, reduced]);

  // Replies still on their way when the page goes.
  useEffect(() => {
    const t = timers.current;
    return () => {
      for (const id of t) window.clearTimeout(id);
      t.length = 0;
    };
  }, []);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    const mine = nextId.current++;
    setMessages((list) => [
      ...list,
      { id: mine, initials: "You", who: "You", when: "now", text, tone: "me" },
    ]);
    const reply = REPLIES[replies.current];
    if (!reply) {
      setSaid("Sent.");
      return;
    }
    replies.current += 1;
    later(700, () =>
      arrive(reply, 1000, () => {
        setSaid(`${reply.who} replied: ${reply.text}`);
        later(700, () =>
          setMessages((list) =>
            list.map((m) => (m.id === mine ? { ...m, stars: 2 } : m)),
          ),
        );
      }),
    );
  };

  return (
    <div
      style={{ maxWidth: 330 }}
      className="relative flex w-full flex-col overflow-hidden border border-keyline bg-raised text-base shadow-pop"
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-2.5">
        {mark}
        <span className="font-semibold text-lg">CMSC351</span>
        <ChevronIcon className="size-3 text-muted" />
        <span className="ml-auto text-muted text-xs">48 in this chat</span>
        <SampleTag inline />
      </div>
      <div className="flex shrink-0 gap-1.5 overflow-hidden border-b px-2.5 py-2">
        {ROOMS.map((r, i) => (
          <span
            key={r}
            className={`inline-flex h-6 shrink-0 items-center border px-2 font-semibold text-sm ${i === 0 ? "border-accent bg-accent text-accent-fg" : "border-hairline-strong text-muted"}`}
          >
            {r}
          </span>
        ))}
      </div>
      <ol
        aria-label="Messages in CMSC351"
        className="flex min-h-56 flex-col justify-end gap-3 px-3 py-2"
      >
        {messages.map((m) => (
          <li key={m.id} className="mk-arrive flex gap-2">
            <span
              aria-hidden="true"
              className={`inline-flex size-7 shrink-0 items-center justify-center border border-keyline font-semibold text-2xs ${AVATAR[m.tone]}`}
            >
              {m.initials}
            </span>
            <div className="min-w-0">
              <div className="font-semibold text-sm">
                {m.who}
                <span className="ml-1.5 font-normal text-muted">{m.when}</span>
              </div>
              <p className="break-words">{m.text}</p>
              {m.stars ? (
                <span
                  title="Two classmates starred this"
                  className="mk-pop mt-1 inline-flex h-4.5 items-center gap-1 border border-hairline-strong px-1.5 font-semibold text-muted text-xs"
                >
                  <StarIcon />
                  {m.stars}
                  <span className="sr-only"> stars</span>
                </span>
              ) : null}
            </div>
          </li>
        ))}
        {typing ? (
          <li className="flex h-7 items-center gap-2">
            <span className="sr-only">Someone's typing</span>
            <span aria-hidden="true" className="size-7 shrink-0" />
            <span className="inline-flex h-5 items-center gap-1 border px-2">
              {[0, 1, 2].map((d) => (
                <i
                  key={d}
                  className="mk-dot size-1.5 bg-muted opacity-30"
                  style={{ animationDelay: `${d * 150}ms` }}
                />
              ))}
            </span>
          </li>
        ) : null}
      </ol>
      <form
        className="flex shrink-0 items-center gap-1.5 border-t px-2.5 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Message CMSC351
        </label>
        <input
          id={inputId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message CMSC351"
          autoComplete="off"
          maxLength={140}
          title="Type a message. It stays on this page."
          className="h-8 min-w-0 flex-1 border border-hairline-strong bg-raised px-2.5 text-base placeholder:text-faint"
        />
        <WithTooltip label="Send" shortcut="↵">
          <button
            type="submit"
            aria-label="Send"
            className="inline-flex size-8 shrink-0 items-center justify-center bg-accent text-accent-fg"
          >
            <SendIcon />
          </button>
        </WithTooltip>
      </form>
      <p aria-live="polite" className="sr-only">
        {said}
      </p>
    </div>
  );
}
