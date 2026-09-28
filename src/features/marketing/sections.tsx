import { ArrowRight } from "lucide-react";
import { Mark } from "~/components/brand/mark";
import { SCHEDULE_PATH } from "~/core/routing";
import { useAccount } from "~/features/auth/account-store";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { CLOSING, CONNECT } from "./copy";
import { NAME, VIEW } from "./products";

// After the story: how the five hand off to each other, then the way in.

export function ConnectSection() {
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
              <p className="flex-1 text-base">{link.text}</p>
              <div>
                <WithTooltip label={`Open Terpsicle ${NAME[link.to]}`}>
                  <a href={VIEW[link.to].to} className="mk-link text-sm">
                    {VIEW[link.to].label}
                  </a>
                </WithTooltip>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
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
        <WithTooltip label="No account needed">
          <Button asChild className="mk-cta">
            <a href={SCHEDULE_PATH}>View schedule</a>
          </Button>
        </WithTooltip>
      </div>
    </section>
  );
}
