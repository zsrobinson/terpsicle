import { type CSSProperties, lazy, Suspense, useRef } from "react";
import { Mark } from "~/app/brand/mark";
import type { MarkId } from "~/app/brand/marks";
import { Logo } from "~/app/logo";
import { WithTooltip } from "~/ui/tooltip";
import { useNear } from "./motion";

// After the five blocks: what we keep, and the footer (Privacy, the data
// credit, "not affiliated", and the contact address in words, never whole
// in the HTML).

const st = (i: number) => ({ "--i": i }) as CSSProperties;

const PROMISES: { mark: MarkId; title: string; body: string }[] = [
  {
    mark: "schedule",
    title: "Signed out works",
    body: "The scheduler works signed out. Plans stay in your browser until you sign in; then they sync to your account.",
  },
  {
    mark: "reviews",
    title: "Anonymous to readers",
    body: "Only verified UMD accounts can write a review, and every one's checked before it's published.",
  },
  {
    mark: "chat",
    title: "Real names in chat",
    body: "Chat shows your real name and Google photo to your classmates.",
  },
  {
    mark: "todo",
    title: "A feed link, not a password",
    body: "Todo keeps a link to your ELMS calendar feed, never your password.",
  },
];

export function PromisesSection() {
  return (
    <section
      aria-labelledby="promises-title"
      data-reveal
      className="mk-section border-t"
    >
      <div className="mk-wrap flex flex-col gap-6">
        <h2 id="promises-title" className="sr-only">
          What to know
        </h2>
        <ul className="mk-promises text-base">
          {PROMISES.map((p, i) => (
            <li
              key={p.title}
              className="mk-st flex flex-col gap-2"
              style={st(i)}
            >
              <h3 className="flex items-center gap-2 font-semibold">
                <Mark id={p.mark} size={18} />
                {p.title}
              </h3>
              <p>{p.body}</p>
            </li>
          ))}
          <li className="mk-st flex flex-col gap-2" style={st(PROMISES.length)}>
            <h3 className="flex items-center gap-2 font-semibold">
              <Mark id="umbrella" size={18} />
              What we keep
            </h3>
            <p>
              Your name, photo and directory ID from Google, your plans, and
              what you write. We don't sell or share any of it. <PrivacyLink />
            </p>
          </li>
        </ul>
      </div>
    </section>
  );
}

function PrivacyLink() {
  return (
    <WithTooltip label="What Terpsicle keeps about you, and why">
      <a href="/privacy" className="mk-link font-semibold">
        Privacy
      </a>
    </WithTooltip>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t py-4 text-muted text-sm">
      <div className="mk-wrap flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="text-fg">
          <Logo />
        </span>
        <PrivacyLink />
        <span>
          Course data from Testudo. Reviews and grades from{" "}
          <WithTooltip label="PlanetTerp, where the grade data and reviews come from">
            <a href="https://planetterp.com" className="mk-link">
              PlanetTerp
            </a>
          </WithTooltip>
          .
        </span>
        <span>Not affiliated with the University of Maryland.</span>
        <Contact />
      </div>
    </footer>
  );
}

// The site's obfuscated address, loaded as the footer nears the viewport:
// it brings its icon set along, which `/` shouldn't load up front.
const ContactEmail = lazy(() =>
  import("~/features/site/contact-email").then((m) => ({
    default: m.ContactEmail,
  })),
);

function Contact() {
  const ref = useRef<HTMLSpanElement>(null);
  const near = useNear(ref, { margin: "400px 0px" });
  return (
    <span
      ref={ref}
      className="inline-flex min-h-7 flex-wrap items-center gap-2"
    >
      {near ? (
        <Suspense fallback={null}>
          Contact: <ContactEmail />
        </Suspense>
      ) : null}
    </span>
  );
}
