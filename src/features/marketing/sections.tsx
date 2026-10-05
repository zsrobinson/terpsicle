import { ArrowRight } from "lucide-react";
import { Mark } from "~/components/brand/mark";
import { LazyTooltip } from "~/components/lazy-tooltip";
import { SCHEDULE_PATH } from "~/core/routing";
import { useAccount } from "~/features/auth/account-store";
import { Button } from "~/ui/button";
import { OUTSIDE_TAB, OutsideArrow } from "~/ui/outside-link";
import { CLOSING, CONNECT, REVIEWS_OUTSIDE_LINK } from "./copy";
import {
  type MarketingProduct,
  NAME,
  useReviewsOutside,
  useView,
} from "./products";

// After the story: how the five hand off to each other, then the way in.

export function ConnectSection() {
  const outside = useReviewsOutside();
  return (
    <section
      aria-labelledby="connect-title"
      className="mk-section border-hairline border-t"
    >
      <div className="mk-wrap flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 id="connect-title" className="mk-display mk-h2">
            {CONNECT.title}
          </h2>
          <p className="mk-body text-muted">{CONNECT.body}</p>
        </div>
        <ul className="mk-connect-grid">
          {CONNECT.links.map((link) => (
            <li
              key={`${link.from}-${link.to}`}
              className="flex flex-col gap-3 border border-hairline-strong bg-raised p-4"
            >
              <span className="flex flex-wrap items-center gap-2 font-semibold text-sm">
                <Mark id={link.from} size={14} />
                {NAME[link.from]}
                <ArrowRight
                  size={13}
                  aria-hidden="true"
                  className="text-muted"
                />
                <span className="sr-only">to</span>
                <Mark id={link.to} size={14} />
                {NAME[link.to]}
              </span>
              <p className="flex-1 text-base">
                {link.to === "reviews" && outside
                  ? REVIEWS_OUTSIDE_LINK
                  : link.text}
              </p>
              <div>
                <ConnectLink to={link.to} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ConnectLink({ to }: { to: MarketingProduct }) {
  const view = useView(to);
  return (
    <LazyTooltip label={view.tooltip}>
      <a
        href={view.to}
        {...(view.outside ? OUTSIDE_TAB : {})}
        className="mk-link inline-flex items-center gap-0.5 text-sm"
      >
        {view.label}
        {view.outside ? <OutsideArrow /> : null}
      </a>
    </LazyTooltip>
  );
}

export function ClosingSection() {
  const status = useAccount((s) => s.status);
  return (
    <section
      aria-labelledby="closing-title"
      className="mk-section border-hairline border-t"
    >
      <div className="mk-wrap flex flex-col items-start gap-6">
        <h2 id="closing-title" className="mk-display mk-h2">
          {CLOSING.title}
        </h2>
        <p className="mk-body">
          {status === "signed-in" ? CLOSING.bodySignedIn : CLOSING.body}
        </p>
        <LazyTooltip label="No account needed">
          <Button className="mk-cta" render={<a href={SCHEDULE_PATH} />}>
            View schedule
          </Button>
        </LazyTooltip>
      </div>
    </section>
  );
}
