import { cn } from "cn";
import { ArrowUp, Bell, BellRing, Star, TriangleAlert } from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { Mark } from "~/app/brand/mark";
import { SCHEDULE_PATH } from "~/core/routing";
import { tintStyle } from "~/features/calendar/tint";
import { Button } from "~/ui/button";
import { Input } from "~/ui/input";
import { ListRow } from "~/ui/list-row";
import { undoToast } from "~/ui/toast";
import { WithTooltip } from "~/ui/tooltip";
import {
  CREDITS,
  type DemoState,
  FULL_SECTION,
  PLAN_A,
  problemsOf,
  problemWords,
  type SampleFix,
  type SampleProblem,
} from "./plan-a";
import { STAGE_OF, type Stage } from "./stages";

// What each product puts on the week, one piece per step of the story
// (story.tsx). They're small working copies of the real UI: the Problems
// tab with its fixes and the seat watch, a course's rating and grades, a
// section's room with its composer, a semester of Plan and a few of Todo's
// cards. Local state only: nothing is saved or sent, and every change says
// so in the app's own toast, with Undo. This module loads on its own, once
// the story is near (story.tsx), so the first paint never waits for it.

export interface PiecesProps {
  stage: Stage;
  state: DemoState;
  onChange: (next: DemoState) => void;
}

export function Pieces({ stage, state, onChange }: PiecesProps) {
  return (
    <>
      <Piece name="plan" stage={stage}>
        <PlanPiece />
      </Piece>
      <Piece name="todo" stage={stage}>
        <TodoPiece />
      </Piece>
      <Piece name="problems" stage={stage} only>
        <ProblemsPiece state={state} onChange={onChange} />
      </Piece>
      <Piece name="reviews" stage={stage}>
        <ReviewsPiece />
      </Piece>
      <Piece name="chat" stage={stage}>
        <ChatPiece />
      </Piece>
    </>
  );
}

/**
 * One piece's slot on the screen. It lands at its stage and stays for the
 * later ones (`only`: just its own, like a tab that closes when you move
 * on). Off screen, it's inert: no Tab stop, nothing read out.
 */
function Piece({
  name,
  stage,
  only = false,
  children,
}: {
  name: keyof typeof STAGE_OF;
  stage: Stage;
  only?: boolean;
  children: ReactNode;
}) {
  const at = STAGE_OF[name];
  const on = only ? stage === at : stage >= at;
  return (
    <div
      data-piece={name}
      data-on={on ? "" : undefined}
      data-current={stage === at ? "" : undefined}
      inert={!on}
      className={`mk-piece mk-piece-${name}`}
    >
      {children}
    </div>
  );
}

/** A floating card: keyline and offset, like everything that floats. */
function Card({
  product,
  title,
  meta,
  right,
  children,
  className,
}: {
  product: "reviews" | "chat" | "plan" | "todo";
  title: ReactNode;
  meta?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border border-keyline bg-raised text-fg shadow-offset",
        className,
      )}
    >
      <div className="flex h-9 items-center gap-2 border-hairline border-b px-3 text-base">
        <Mark id={product} size={16} />
        <span className="shrink-0 font-semibold">{title}</span>
        {meta ? (
          <span className="min-w-0 truncate text-muted text-sm">{meta}</span>
        ) : null}
        {right ? <span className="ml-auto shrink-0">{right}</span> : null}
      </div>
      {children}
    </div>
  );
}

/** "CMSC351 0301 is full": codes in the mono face, as the app sets them. */
function Codes({ text }: { text: string }) {
  const parts = text.split(/(\b[A-Z]{4}\d{3}[A-Z]?\b(?: \d{4}\b)?)/);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          // The pieces of one fixed sentence never reorder.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          <span key={i} className="ident">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

// ---------- Schedule: the Problems tab ----------

function ProblemsPiece({
  state,
  onChange,
}: {
  state: DemoState;
  onChange: (next: DemoState) => void;
}) {
  const problems = problemsOf(state);
  const list = useRef<HTMLUListElement>(null);
  // A fix takes its row, and the button that was pressed, away: focus goes
  // to the next fix at the top of the list, never to the page's start.
  const refocus = useRef(false);
  const count = problems.length;
  useEffect(() => {
    if (!refocus.current || count === 0) return;
    refocus.current = false;
    const el = list.current;
    if (!el) return;
    el.scrollTop = 0;
    el.querySelector("button")?.focus({ preventScroll: true });
  }, [count]);
  const fix = (problem: SampleProblem, f: SampleFix) => {
    const before = state;
    if (f.kind === "watch") {
      const watching = !state.watching;
      onChange({ ...state, watching });
      const section = `${FULL_SECTION.course} ${FULL_SECTION.section}`;
      undoToast({
        id: "mk-watch",
        message: watching
          ? `Watching ${section} for a seat`
          : `Stopped watching ${section}`,
        description: watching
          ? "A sample: sign in to get a real one."
          : undefined,
        onUndo: () => onChange(before),
      });
      return;
    }
    refocus.current = true;
    onChange({ ...state, [f.course]: f.to });
    undoToast({
      id: `mk-${problem.id}`,
      message: `Switched ${f.course} to ${f.to}`,
      onUndo: () => onChange(before),
    });
  };
  return (
    <div className="flex h-full flex-col border-keyline border-r bg-bg text-fg shadow-offset">
      <div className="mk-problems-head flex min-h-12 shrink-0 flex-col justify-center border-hairline border-b px-4 py-1">
        <span className="font-semibold text-base">Problems</span>
        <span className="tnum text-muted text-sm">
          {problemWords(problems.length)}
        </span>
      </div>
      <div className="mk-problems-group flex h-9 shrink-0 items-center gap-2 border-hairline border-b px-4 text-sm">
        <span className="font-medium">Worth a look</span>
        <span className="tnum text-muted">{problems.length}</span>
      </div>
      <ul ref={list} className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {problems.map((p) => (
          <ListRow
            as="li"
            key={p.id}
            align="start"
            data-problem={p.id}
            className="mk-arrive py-3"
            lead={
              <TriangleAlert
                size={15}
                aria-hidden="true"
                className="mt-px text-warn"
              />
            }
          >
            <span className="block font-medium text-base">
              <Codes text={p.title} />
            </span>
            <span className="mt-0.5 block text-muted text-sm">{p.detail}</span>
            <div className="mt-2 flex">
              {p.fix.kind === "watch" ? (
                <WatchButton
                  watching={state.watching}
                  onClick={() => fix(p, p.fix)}
                />
              ) : (
                <WithTooltip label={`${p.fix.label}. You can undo this.`}>
                  <Button
                    variant="outline"
                    size="row"
                    onClick={() => fix(p, p.fix)}
                  >
                    {p.fix.label}
                  </Button>
                </WithTooltip>
              )}
            </div>
          </ListRow>
        ))}
      </ul>
    </div>
  );
}

/** The seat watch, as the problem's fix shows it (seat-bell.tsx). */
function WatchButton({
  watching,
  onClick,
}: {
  watching: boolean;
  onClick: () => void;
}) {
  const section = `${FULL_SECTION.course} ${FULL_SECTION.section}`;
  return (
    <WithTooltip
      label={
        watching
          ? `Watching ${section}: we'll let you know when a seat opens. Click to stop.`
          : "Watch for a seat: we'll let you know when one opens"
      }
    >
      <Button
        variant="outline"
        size="row"
        aria-pressed={watching}
        aria-label={
          watching ? `Watching ${section}` : `Watch ${section} for a seat`
        }
        onClick={onClick}
      >
        {watching ? (
          <BellRing aria-hidden="true" className="size-3.5 fill-current" />
        ) : (
          <Bell aria-hidden="true" className="size-3.5" />
        )}
        {watching ? "Watching" : "Watch for a seat"}
      </Button>
    </WithTooltip>
  );
}

// ---------- Reviews: a rating and the grades ----------

const GRADES: readonly [string, number][] = [
  ["A", 47],
  ["B", 31],
  ["C", 12],
  ["D", 3],
  ["F", 2],
  ["W", 3],
  ["Other", 2],
];
const TALLEST = Math.max(...GRADES.map(([, pct]) => pct));

function ReviewsPiece() {
  return (
    <Card
      product="reviews"
      title={<span className="ident">STAT400</span>}
      meta="Kemi Adeyemi"
      right={
        <WithTooltip label="4.4 from 72 reviews: 12 on Terpsicle and 60 on PlanetTerp">
          <button
            type="button"
            aria-label="Rated 4.4 from 72 reviews"
            className="flex items-center gap-1 text-sm hover:bg-hover"
          >
            <Star
              size={13}
              aria-hidden="true"
              className="fill-current text-warn"
            />
            <span className="tnum font-semibold">4.4</span>
            <span className="tnum text-muted">(72)</span>
          </button>
        </WithTooltip>
      }
    >
      <div className="flex flex-col gap-3 p-3">
        <figure className="flex flex-col gap-1">
          <blockquote className="text-sm">
            &ldquo;Homework is long, but it's exactly what's on the exams. Go to
            office hours early.&rdquo;
          </blockquote>
          <figcaption className="text-muted text-xs">
            Spring 2026 · anonymous
          </figcaption>
        </figure>
        <div>
          <p className="tnum text-sm">
            <span className="font-semibold">82% got an A or B</span>
            <span className="text-muted"> · average GPA 3.21</span>
          </p>
          <div
            role="img"
            aria-label={`Grades: ${GRADES.map(([g, p]) => `${g} ${p}%`).join(", ")}`}
            className="mk-grades mt-2 grid grid-cols-7 items-end gap-1"
          >
            {GRADES.map(([grade, pct]) => (
              <div key={grade} className="flex flex-col items-center gap-0.5">
                <span className="tnum text-2xs text-muted">{pct}%</span>
                <span className="mk-grade-col flex w-full flex-col justify-end bg-hover">
                  <span
                    className="block bg-fg/55"
                    style={{ height: `${(pct / TALLEST) * 100}%` }}
                  />
                </span>
                <span className="ident text-2xs">{grade}</span>
              </div>
            ))}
          </div>
          <p className="mt-1 text-faint text-xs">
            Grades from PlanetTerp, through Spring 2025.
          </p>
        </div>
      </div>
    </Card>
  );
}

// ---------- Chat: the section's room ----------

interface Message {
  id: string;
  who: string;
  initials: string;
  when: string;
  text: string;
  mine?: boolean;
}

const ROOM: readonly Message[] = [
  {
    id: "m1",
    who: "Maya Okafor",
    initials: "MO",
    when: "2:14pm",
    text: "Is the Friday discussion in CSI 1115 or 1122 this week?",
  },
  {
    id: "m2",
    who: "Devin Ruiz",
    initials: "DR",
    when: "2:16pm",
    text: "1122. It moved after week 2. Testudo still says 1115.",
  },
];

const REPLY = "Sounds good, see you there.";
/** A classmate answers a moment later: long enough to notice it arrive. */
const REPLY_AFTER_MS = 1600;

function ChatPiece() {
  const [messages, setMessages] = useState<readonly Message[]>(ROOM);
  const [draft, setDraft] = useState("");
  const sent = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const send = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const n = ++sent.current;
    setMessages((m) => [
      ...m,
      {
        id: `me${n}`,
        who: "You",
        initials: "YOU",
        when: "now",
        text,
        mine: true,
      },
    ]);
    setDraft("");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () =>
        setMessages((m) => [
          ...m,
          {
            id: `r${n}`,
            who: "Devin Ruiz",
            initials: "DR",
            when: "now",
            text: REPLY,
          },
        ]),
      REPLY_AFTER_MS,
    );
  };
  return (
    <div className="flex flex-col items-end gap-2">
      <WithTooltip label="Open Terpsicle Chat">
        <a
          href="/chat"
          className="mk-join flex h-8 items-center gap-2 border border-keyline bg-raised px-2.5 font-semibold text-base shadow-offset hover:bg-hover"
        >
          <Mark id="chat" size={14} />
          Join CMSC351 chat
        </a>
      </WithTooltip>
      <Card
        product="chat"
        title={<span className="ident">0301</span>}
        meta="MWF 11am · CMSC351"
        className="w-full"
      >
        <ul
          aria-label="Messages in CMSC351 0301"
          aria-live="polite"
          className="mk-chat-log flex flex-col justify-end overflow-hidden px-3 py-2"
        >
          {messages.map((m) => (
            <li key={m.id} className="mk-arrive flex gap-2 py-1">
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full font-semibold text-2xs",
                  m.mine ? "bg-fg text-bg" : "bg-hover text-muted",
                )}
              >
                {m.mine ? "Y" : m.initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="font-semibold text-sm">{m.who}</span>
                  <span className="text-faint text-xs">{m.when}</span>
                </span>
                <span className="block break-words text-sm">{m.text}</span>
              </span>
            </li>
          ))}
        </ul>
        <form
          onSubmit={send}
          className="flex items-center gap-2 border-hairline border-t p-2"
        >
          <WithTooltip label="A sample room: what you send stays on this page">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Message CMSC351 0301"
              placeholder="Message 0301 · MWF 11am"
              maxLength={200}
              autoComplete="off"
            />
          </WithTooltip>
          <WithTooltip label="Send" shortcut="Enter">
            <Button type="submit" size="icon" aria-label="Send">
              <ArrowUp aria-hidden="true" />
            </Button>
          </WithTooltip>
        </form>
      </Card>
    </div>
  );
}

// ---------- Plan: the semester this week belongs to ----------

function PlanPiece() {
  return (
    <div className="flex flex-col border border-keyline bg-product-plan-soft text-fg shadow-offset">
      <div className="flex h-9 items-center gap-2 border-hairline border-b px-3 text-base">
        <Mark id="plan" size={16} />
        <span className="whitespace-nowrap font-semibold">Spring 2027</span>
        <span className="tnum ml-auto whitespace-nowrap text-muted text-sm">
          {CREDITS} cr
        </span>
      </div>
      <ul className="flex flex-col gap-1 p-2">
        {PLAN_A.map((c) => (
          <li
            key={c.code}
            className="flex flex-col border border-hairline-strong bg-raised px-2 py-1"
          >
            <span className="flex items-baseline gap-2 text-sm">
              <span className="ident font-semibold">{c.code}</span>
              <span className="tnum text-muted text-xs">{c.credits} cr</span>
              {c.genEd ? (
                <span className="ml-auto border border-hairline-strong px-1 text-2xs text-muted">
                  {c.genEd}
                </span>
              ) : null}
            </span>
            <span className="mk-plan-title truncate text-muted text-xs">
              {c.title}
            </span>
          </li>
        ))}
      </ul>
      <div className="border-hairline border-t px-3 py-2">
        <WithTooltip label="Hands this semester to the scheduler">
          <a href={SCHEDULE_PATH} className="mk-link font-semibold text-sm">
            View schedule
          </a>
        </WithTooltip>
      </div>
    </div>
  );
}

// ---------- Todo: what's due this week ----------

interface Due {
  id: string;
  day: string;
  time: string;
  course: (typeof PLAN_A)[number];
  title: string;
}

function planCourse(code: string): (typeof PLAN_A)[number] {
  const found = PLAN_A.find((c) => c.code === code);
  // The codes below are Plan A's own.
  if (!found) throw new Error(`No ${code} in Plan A`);
  return found;
}

const DUE: readonly Due[] = [
  {
    id: "p2",
    day: "Tue",
    time: "11:59pm",
    course: planCourse("CMSC330"),
    title: "Project 2",
  },
  {
    id: "hw4",
    day: "Thu",
    time: "11:59pm",
    course: planCourse("STAT400"),
    title: "Homework 4",
  },
  {
    id: "memo",
    day: "Fri",
    time: "5pm",
    course: planCourse("ENGL393"),
    title: "Memo draft",
  },
];

function TodoPiece() {
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const toggle = (item: Due) => {
    const before = done;
    const next = new Set(done);
    const nowDone = !next.has(item.id);
    if (nowDone) next.add(item.id);
    else next.delete(item.id);
    setDone(next);
    undoToast({
      id: `mk-todo-${item.id}`,
      message: nowDone ? `Done: ${item.title}` : `Not done: ${item.title}`,
      onUndo: () => setDone(before),
    });
  };
  const open = DUE.length - done.size;
  return (
    <Card product="todo" title="This week" meta={`${open} to do · from ELMS`}>
      <ul className="grid grid-cols-3 gap-1 p-2">
        {DUE.map((item) => {
          const checked = done.has(item.id);
          return (
            <li
              key={item.id}
              className={cn(
                "flex min-w-0 flex-col border text-xs",
                checked && "border-hairline-strong bg-panel text-muted",
              )}
              style={checked ? undefined : tintStyle(item.course.color)}
            >
              <label className="flex cursor-pointer flex-col gap-0.5 p-1.5">
                <span className="flex items-center gap-1.5">
                  <WithTooltip
                    label={checked ? "Mark as not done" : "Mark done"}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(item)}
                      aria-label={`Done: ${item.title}`}
                      className="size-4 shrink-0 cursor-pointer accent-accent"
                    />
                  </WithTooltip>
                  <span
                    className={cn("tnum truncate", !checked && "opacity-80")}
                  >
                    {item.day} {item.time}
                  </span>
                </span>
                <span
                  className={cn(
                    "block break-words font-medium",
                    checked && "line-through",
                  )}
                >
                  {item.title}
                </span>
                <span className="ident block">{item.course.code}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
