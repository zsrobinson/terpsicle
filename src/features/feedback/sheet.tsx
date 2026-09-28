import { cn } from "cn";
import { Bug, ImageUp, Lightbulb, Pencil, Pin } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Drawer } from "vaul";
import { browserName } from "~/core/feedback/context";
import type { FeedbackProduct } from "~/core/schema/feedback";
import { useAccount } from "~/features/auth/account-store";
import { track } from "~/lib/analytics";
import { isApple, modKey } from "~/lib/shortcuts";
import { Button } from "~/ui/button";
import { InlineError } from "~/ui/inline-error";
import { Popover, PopoverAnchor, PopoverContent } from "~/ui/popover";
import { Skeleton } from "~/ui/skeleton";
import { quietTooltips, WithTooltip } from "~/ui/tooltip";
import { type SheetMode, useDraft } from "./draft-store";
import { usePins } from "./pin-store";
import { RedactEditor } from "./redact-editor";
import {
  releaseShot,
  ShotTooBigError,
  shotFromFile,
  takeScreenshot,
} from "./screenshot";
import {
  APP_VERSION,
  currentTheme,
  feedbackPagePath,
  sendDraft,
  sendFailure,
  TOO_BIG,
} from "./send";

// The feedback sheet (docs/FEEDBACK.md): pick the kind, say what happened
// or what would help, and choose what goes with it. Loaded on first hover
// or focus of "Send feedback" (./feedback-button.tsx). A popover on
// desktop, a drawer on phones; closing keeps the draft.

export const PRODUCT_NAMES: Record<FeedbackProduct, string> = {
  schedule: "Schedule",
  reviews: "Reviews",
  chat: "Chat",
  plan: "Plan",
  todo: "Todo",
  site: "Terpsicle",
  settings: "Settings",
  admin: "Admin",
};

/** Takes a new screenshot unless the person edited or chose one. */
function useFreshScreenshot() {
  const includeShot = useDraft((s) => s.includeShot);
  const mode = useDraft((s) => s.mode);
  useEffect(() => {
    if (!includeShot || mode === "pin") return;
    const { shot, setShot } = useDraft.getState();
    if (shot.status === "taking") return;
    if (shot.status === "ready" && (shot.shot.edited || shot.shot.fromFile))
      return;
    let current = true;
    setShot({ status: "taking" });
    // After the sheet has painted, so the page underneath is settled.
    const timer = window.setTimeout(() => {
      takeScreenshot().then(
        (next) => {
          if (current)
            useDraft.getState().setShot({ status: "ready", shot: next });
          // Closed while it was taken: nobody will see it.
          else releaseShot(next);
        },
        (error: unknown) => {
          console.warn("Feedback screenshot failed", error);
          if (current)
            useDraft.getState().setShot({
              status: "failed",
              reason: error instanceof ShotTooBigError ? "too-big" : "error",
            });
        },
      );
    }, 50);
    return () => {
      current = false;
      window.clearTimeout(timer);
      // Closed before it finished: take it again next time.
      if (useDraft.getState().shot.status === "taking")
        useDraft.getState().setShot({ status: "none" });
    };
  }, [includeShot, mode]);
}

const MODES: {
  id: SheetMode;
  label: string;
  tip: string;
  icon: ReactNode;
}[] = [
  {
    id: "bug",
    label: "Report a bug",
    tip: "Something's broken or wrong",
    icon: <Bug aria-hidden="true" />,
  },
  {
    id: "idea",
    label: "Suggest a feature",
    tip: "Something that would help",
    icon: <Lightbulb aria-hidden="true" />,
  },
  {
    id: "pin",
    label: "Pin a note",
    tip: "Admins: leave a note on part of this page",
    icon: <Pin aria-hidden="true" />,
  },
];

function KindPicker({ admin }: { admin: boolean }) {
  const mode = useDraft((s) => s.mode);
  const set = useDraft((s) => s.set);
  const modes = MODES.filter((m) => admin || m.id !== "pin");
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + modes.length) % modes.length;
    const target = modes[next];
    if (target) set({ mode: target.id });
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label="What kind of feedback"
      // Admins' "Pin a note" gets a row of its own under the two kinds.
      className="grid grid-cols-2 gap-1"
    >
      {modes.map((m, i) => {
        const checked = m.id === mode;
        return (
          <WithTooltip key={m.id} label={m.tip}>
            {/* biome-ignore lint/a11y/useSemanticElements: a segmented control, styled as buttons */}
            <button
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => set({ mode: m.id })}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                "flex min-h-9 items-center justify-center gap-1.5 rounded-md border px-2 font-medium text-sm transition-colors [&_svg]:size-3.5 [&_svg]:shrink-0",
                m.id === "pin" && "col-span-2",
                checked
                  ? "border-fg bg-hover text-fg"
                  : "border-hairline text-muted hover:bg-hover hover:text-fg",
              )}
            >
              {m.icon}
              {m.label}
            </button>
          </WithTooltip>
        );
      })}
    </div>
  );
}

const FIELD =
  "w-full resize-y rounded-md border border-hairline-strong bg-bg px-2 py-1.5 text-base leading-5 placeholder:text-faint focus:border-fg/40";

function TextField({
  label,
  hint,
  optional = false,
  value,
  onChange,
  rows,
  tip,
  autoFocus = false,
  placeholder,
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  tip: string;
  autoFocus?: boolean;
  placeholder: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="flex items-baseline gap-1.5">
        <span className="font-medium text-sm">{label}</span>
        {optional ? <span className="text-faint text-xs">Optional</span> : null}
      </label>
      <WithTooltip label={tip}>
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          maxLength={4_000}
          // Autofocus in a sheet the person just opened is where they'd type.
          // biome-ignore lint/a11y/noAutofocus: the sheet opens to type in
          autoFocus={autoFocus}
          aria-describedby={hint ? `${id}-hint` : undefined}
          placeholder={placeholder}
          className={FIELD}
        />
      </WithTooltip>
      {hint ? (
        <p id={`${id}-hint`} className="text-faint text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Check({
  checked,
  onChange,
  label,
  tip,
  off,
  testId,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  tip: string;
  /** The quiet note when it's off. */
  off?: string;
  testId: string;
}) {
  return (
    <div>
      <WithTooltip label={tip}>
        <label className="flex w-fit items-center gap-2 text-base">
          <input
            type="checkbox"
            data-testid={testId}
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="size-3.5 accent-accent"
          />
          {label}
        </label>
      </WithTooltip>
      {!checked && off ? (
        <p className="mt-0.5 pl-6 text-muted text-sm">{off}</p>
      ) : null}
    </div>
  );
}

function ScreenshotPreview() {
  const shot = useDraft((s) => s.shot);
  const setShot = useDraft((s) => s.setShot);
  const [editing, setEditing] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const choose = async (picked: File | undefined) => {
    if (!picked) return;
    setShot({ status: "taking" });
    try {
      const next = await shotFromFile(picked);
      setShot(
        next
          ? { status: "ready", shot: next }
          : { status: "failed", reason: "unreadable" },
      );
    } catch (error) {
      setShot({
        status: "failed",
        reason: error instanceof ShotTooBigError ? "too-big" : "error",
      });
    }
  };

  const chooser = (
    <>
      <input
        ref={file}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="feedback-file"
        onChange={(e) => {
          void choose(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <WithTooltip label="Send a picture you already have instead">
        <Button
          variant="ghost"
          size="row"
          onClick={() => file.current?.click()}
        >
          <ImageUp aria-hidden="true" />
          Choose an image instead
        </Button>
      </WithTooltip>
    </>
  );

  if (shot.status === "taking" || shot.status === "none")
    return (
      <div className="space-y-1 pl-6">
        <Skeleton className="h-24 w-full" />
        <p className="text-faint text-xs" role="status">
          Taking a screenshot…
        </p>
      </div>
    );
  if (shot.status === "failed")
    return (
      <div className="space-y-1 pl-6">
        <p className="text-muted text-sm">
          {shot.reason === "too-big"
            ? TOO_BIG
            : shot.reason === "unreadable"
              ? "That file isn't an image we can read. Try a PNG, JPEG or WebP."
              : "Couldn't take a screenshot. Choose an image, or send without one."}
        </p>
        {chooser}
      </div>
    );
  return (
    <div className="space-y-1 pl-6">
      <WithTooltip label="Black out or crop parts of it">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="block w-full overflow-hidden rounded-md border border-hairline bg-panel"
        >
          <img
            src={shot.shot.url}
            alt="The screenshot that will be sent"
            data-testid="feedback-shot"
            className="mx-auto max-h-32 w-auto object-contain"
          />
        </button>
      </WithTooltip>
      <div className="flex flex-wrap items-center gap-1">
        <WithTooltip label="Black out or crop parts of it">
          <Button variant="ghost" size="row" onClick={() => setEditing(true)}>
            <Pencil aria-hidden="true" />
            Edit
          </Button>
        </WithTooltip>
        {chooser}
      </div>
      {editing ? (
        <RedactEditor
          shot={shot.shot}
          onClose={() => setEditing(false)}
          onDone={(next) => {
            setShot({ status: "ready", shot: next });
            setEditing(false);
          }}
        />
      ) : null}
    </div>
  );
}

function PinModeFields({ onStartPin }: { onStartPin: () => void }) {
  const visible = usePins((s) => s.visible);
  const setVisible = usePins((s) => s.setVisible);
  return (
    <div className="space-y-3">
      <p className="text-muted text-sm">
        Pick any part of this page to leave a note on it. Pinned notes go to the
        feedback inbox, and only admins see their dots.
      </p>
      <Check
        checked={visible}
        onChange={setVisible}
        label="Show pins on this page"
        tip="Numbered dots where notes were left on this page"
        testId="feedback-show-pins"
      />
      <WithTooltip label="Hover to outline, click to leave a note. Esc stops.">
        <Button className="w-full" onClick={onStartPin}>
          <Pin aria-hidden="true" />
          Pick something to pin
        </Button>
      </WithTooltip>
    </div>
  );
}

/** The sheet's contents, the same in the popover and the drawer. */
export function FeedbackForm({
  product,
  onSent,
  onStartPin,
  autoFocus = true,
}: {
  product: FeedbackProduct;
  onSent: () => void;
  onStartPin: () => void;
  autoFocus?: boolean;
}) {
  const draft = useDraft();
  const signedIn = useAccount((s) => s.status === "signed-in");
  const admin = useAccount((s) => s.user?.isAdmin === true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useFreshScreenshot();

  // Someone who stops being an admin mid-draft goes back to a bug.
  const mode = !admin && draft.mode === "pin" ? "bug" : draft.mode;
  const ready = draft.text.trim().length > 0;
  const shotBusy = draft.includeShot && draft.shot.status === "taking";

  const send = async () => {
    if (!ready || sending || shotBusy || mode === "pin") return;
    setSending(true);
    setError(null);
    try {
      await sendDraft({ ...draft, mode }, product, signedIn);
      onSent();
    } catch (e) {
      setError(
        sendFailure(e, draft.includeShot && draft.shot.status === "ready"),
      );
    } finally {
      setSending(false);
    }
  };

  const context = [
    PRODUCT_NAMES[product],
    feedbackPagePath(),
    browserName(navigator.userAgent),
    currentTheme() === "dark" ? "Dark" : "Light",
    APP_VERSION,
  ].join(" · ");

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (isApple ? e.metaKey : e.ctrlKey)) {
          e.preventDefault();
          void send();
        }
      }}
    >
      <KindPicker admin={admin} />
      {mode === "pin" ? (
        <PinModeFields onStartPin={onStartPin} />
      ) : (
        <>
          {mode === "bug" ? (
            <>
              <TextField
                key="bug"
                label="What happened?"
                tip="What you did, and what went wrong"
                value={draft.text}
                onChange={(text) => draft.set({ text })}
                rows={4}
                autoFocus={autoFocus}
                placeholder="I clicked… and then…"
              />
              <TextField
                label="What did you expect?"
                optional
                tip="What you thought would happen instead"
                value={draft.expected}
                onChange={(expected) => draft.set({ expected })}
                rows={2}
                placeholder="I thought it would…"
              />
            </>
          ) : (
            <TextField
              key="idea"
              label="What would help?"
              tip="What you'd like Terpsicle to do"
              value={draft.text}
              onChange={(text) => draft.set({ text })}
              rows={5}
              autoFocus={autoFocus}
              placeholder="It'd help if…"
            />
          )}
          <div className="space-y-2">
            <Check
              checked={draft.includeContext}
              onChange={(includeContext) => draft.set({ includeContext })}
              label="Include what I was doing"
              tip="Your plan, settings, recent clicks in the app and any errors. Never your links or other people's words."
              off="Without this, bugs are harder for us to track down."
              testId="feedback-context"
            />
            <Check
              checked={draft.includeShot}
              onChange={(includeShot) => draft.set({ includeShot })}
              label="Include a screenshot"
              tip="A picture of this page, with names, messages and your block labels blacked out"
              off="Without a screenshot, it's harder to see what you saw."
              testId="feedback-screenshot"
            />
            {draft.includeShot ? <ScreenshotPreview /> : null}
            {signedIn ? (
              <Check
                checked={draft.reply}
                onChange={(reply) => draft.set({ reply })}
                label="You can reply by email"
                tip="We'll email you once when it's fixed. Off, we don't keep who sent it."
                testId="feedback-reply"
              />
            ) : null}
          </div>
          <p
            className="break-all text-faint text-xs"
            data-testid="feedback-context-line"
          >
            {context}
          </p>
          {/* Send is the way to try again, right below. */}
          {error ? <InlineError className="py-0" message={error} /> : null}
          <WithTooltip label="Send it to us" shortcut={modKey("↵")}>
            <Button
              type="submit"
              className="w-full"
              disabled={!ready || sending || shotBusy}
            >
              {sending
                ? "Sending…"
                : shotBusy
                  ? "Taking a screenshot…"
                  : "Send"}
            </Button>
          </WithTooltip>
        </>
      )}
    </form>
  );
}

function useStartPinning(close: () => void) {
  return () => {
    close();
    usePins.getState().setPicking(true);
  };
}

/** Phones: the sheet in a bottom drawer. */
function FeedbackDrawer({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: FeedbackProduct;
}) {
  const startPin = useStartPinning(() => onOpenChange(false));
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay
          data-feedback-ui=""
          className="fixed inset-0 z-40 bg-fg/20"
        />
        <Drawer.Content
          data-feedback-ui=""
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-lg border border-hairline bg-raised text-fg outline-none"
        >
          <div
            aria-hidden="true"
            className="mx-auto mt-2 h-1 w-8 shrink-0 rounded-full bg-hairline-strong"
          />
          <Drawer.Title className="px-4 pt-3 pb-2 font-semibold text-lg tracking-tight">
            Send feedback
          </Drawer.Title>
          <div className="overflow-y-auto px-4 pb-6">
            <FeedbackForm
              product={product}
              onSent={() => onOpenChange(false)}
              onStartPin={startPin}
              // Phones: the keyboard would cover the picker before it's read.
              autoFocus={false}
            />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/** Desktop: the sheet in a popover under the button. */
function FeedbackPopover({
  open,
  onOpenChange,
  anchor,
  product,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: RefObject<HTMLButtonElement | null>;
  product: FeedbackProduct;
}) {
  const startPin = useStartPinning(() => onOpenChange(false));
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent
        data-feedback-ui=""
        align="end"
        aria-label="Send feedback"
        role="dialog"
        className="max-h-(--radix-popover-content-available-height) w-[380px] overflow-y-auto"
        // The first field takes focus: its tooltip would cover its label.
        onOpenAutoFocus={() => quietTooltips(800)}
        // The button toggles it: a press on it isn't a click away.
        onInteractOutside={(e) => {
          if (anchor.current?.contains(e.target as Node)) e.preventDefault();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          anchor.current?.focus();
        }}
      >
        <h2 className="mb-3 font-semibold text-lg tracking-tight">
          Send feedback
        </h2>
        <FeedbackForm
          product={product}
          onSent={() => onOpenChange(false)}
          onStartPin={startPin}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * The sheet, opened by "Send feedback" (./feedback-button.tsx): a popover
 * on desktop, a drawer on phones. Counts each opening.
 */
export function FeedbackSurface({
  open,
  onOpenChange,
  anchor,
  mobile,
  product,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: RefObject<HTMLButtonElement | null>;
  mobile: boolean;
  product: FeedbackProduct;
}) {
  useEffect(() => {
    if (open) track("feedback_opened", { product });
  }, [open, product]);
  return mobile ? (
    <FeedbackDrawer open={open} onOpenChange={onOpenChange} product={product} />
  ) : (
    <FeedbackPopover
      open={open}
      onOpenChange={onOpenChange}
      anchor={anchor}
      product={product}
    />
  );
}
