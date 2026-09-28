import { cn } from "cn";
import { MessageSquareText } from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { create } from "zustand";
import { useIsMobile } from "~/app/use-media-query";
import type { FeedbackProduct } from "~/core/schema/feedback";
import { useAccount } from "~/features/auth/account-store";
import { quietTooltips, WithTooltip } from "~/ui/tooltip";

// "Send feedback" (docs/FEEDBACK.md): the one eager piece of feedback, a
// plain button. The sheet (its popover or drawer), the screenshot code and
// the admin's pins load on first hover or focus (scripts/check-bundle.ts
// keeps them out of every first load).

const loadSheet = () => import("./sheet");
const loadAdmin = () => import("./admin-layer");

const FeedbackSurface = lazy(() =>
  loadSheet().then((m) => ({ default: m.FeedbackSurface })),
);
const AdminLayer = lazy(() =>
  loadAdmin().then((m) => ({ default: m.AdminLayer })),
);

function prefetch() {
  void loadSheet();
}

/** Opens from elsewhere: the scheduler's phone menu (./top-bar.tsx). */
const requests = create<{ count: number }>(() => ({ count: 0 }));

/** Opens the sheet of the page's "Send feedback", button or not. */
export function openFeedbackSheet(): void {
  prefetch();
  requests.setState((s) => ({ count: s.count + 1 }));
}

/**
 * The button, in the scheduler's top bar and every product's header (not
 * on `/` or `/privacy`: `feedbackProduct` says where). An icon and
 * "Feedback" on desktop, the icon alone on phones. No router here, so the
 * lazy parts share nothing with it (keeps the router in one chunk).
 */
export function FeedbackButton({
  product,
  pathname,
  compact = false,
  showButton = true,
  labelFromXl = false,
}: {
  product: FeedbackProduct;
  /** Where the admin's pins are looked up. */
  pathname: string;
  compact?: boolean;
  /** False where a menu opens it instead (`openFeedbackSheet`). */
  showButton?: boolean;
  /** Just the icon below 1280px, where a bar with a context needs the room. */
  labelFromXl?: boolean;
}) {
  const admin = useAccount((s) => s.user?.isAdmin === true);
  const mobile = useIsMobile();
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // Mounted from the first open on, so it can animate away.
  const [used, setUsed] = useState(false);
  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (next) setUsed(true);
  }, []);
  const requested = requests((s) => s.count);
  // Only requests made while this button is on the page.
  const handled = useRef(requested);
  useEffect(() => {
    if (requested > handled.current) onOpenChange(true);
    handled.current = requested;
  }, [requested, onOpenChange]);
  const iconOnly = compact || mobile;

  return (
    <>
      {showButton ? (
        <WithTooltip label="Send feedback" side="bottom">
          <button
            ref={button}
            type="button"
            aria-label={iconOnly ? "Send feedback" : undefined}
            aria-haspopup="dialog"
            aria-expanded={open}
            data-state={open ? "open" : "closed"}
            data-testid="feedback-button"
            onPointerEnter={prefetch}
            onFocus={prefetch}
            onClick={() => {
              // The sheet's first field takes focus: no tooltip over its label.
              if (!open) quietTooltips(800);
              onOpenChange(!open);
            }}
            className={cn(
              "flex shrink-0 items-center justify-center gap-1.5 rounded-md text-base text-muted transition-colors hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg",
              iconOnly ? "size-8 max-[380px]:size-7" : "h-7 px-2",
              !iconOnly && labelFromXl && "max-xl:size-8 max-xl:px-0",
            )}
          >
            <MessageSquareText size={iconOnly ? 16 : 14} aria-hidden="true" />
            {iconOnly ? null : labelFromXl ? (
              // Its name stays "Feedback" at every width.
              <span className="max-xl:sr-only">Feedback</span>
            ) : (
              "Feedback"
            )}
          </button>
        </WithTooltip>
      ) : null}
      {used ? (
        <Suspense fallback={null}>
          <FeedbackSurface
            open={open}
            onOpenChange={onOpenChange}
            anchor={button}
            mobile={mobile}
            product={product}
          />
        </Suspense>
      ) : null}
      {admin ? (
        <Suspense fallback={null}>
          <AdminLayer pathname={pathname} product={product} />
        </Suspense>
      ) : null}
    </>
  );
}
