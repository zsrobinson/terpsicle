import type { CSSProperties } from "react";
import { Mark } from "~/app/brand/mark";
import type { MarkId } from "~/app/brand/marks";
import { Logo } from "~/app/logo";
import { ContactEmail } from "~/features/site/contact-email";
import { WithTooltip } from "~/ui/tooltip";
import { Misprint } from "./misprint";

// After the five blocks: one icon on your phone, what we keep, and the
// footer (Privacy, the data credit, "not affiliated", and the contact
// address in words, never whole in the HTML).

const st = (i: number) => ({ "--i": i }) as CSSProperties;

export function InstallSection() {
  return (
    <section
      aria-labelledby="install-title"
      data-reveal
      className="mk-section border-t"
    >
      <div className="mk-wrap grid items-center gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2
            id="install-title"
            className="mk-st mk-display text-headline"
            style={st(0)}
          >
            <Misprint className="text-product-schedule-mis">
              And one icon on your phone.
            </Misprint>
          </h2>
          <p className="mk-st max-w-[58ch] text-lg leading-6" style={st(1)}>
            Install terpsicle.com once. Every part opens from the same icon,
            full screen, with notifications.
          </p>
          <p className="mk-st text-muted" style={st(2)}>
            On iPhone: Share, then Add to Home Screen. On Android and desktop:
            your browser offers Install.
          </p>
          <p className="mk-st text-muted" style={st(3)}>
            Seat watch: an email and a push when a seat opens in a section
            you're watching. Chat: a push when someone mentions or replies to
            you, and an optional email digest. That's about it.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3">
          <Notification
            i={1}
            title="A seat opened in ECON200 0101"
            body="1 of 300 open. Add it before it fills."
          />
          <Notification
            i={2}
            mark="chat"
            app="Terpsicle Chat"
            title="Devin Ruiz replied in CMSC351"
            body="1207. It moved after week 2, Testudo still says 1116."
          />
        </div>
      </div>
    </section>
  );
}

/** A sample notification, drawn like the phone's own. */
function Notification({
  i,
  mark = "umbrella",
  app = "Terpsicle",
  title,
  body,
}: {
  i: number;
  mark?: MarkId;
  app?: string;
  title: string;
  body: string;
}) {
  return (
    <div
      className="mk-st grid w-full max-w-[360px] grid-cols-[36px_1fr] gap-x-3 border border-keyline bg-raised px-3 py-2 text-sm shadow-offset"
      style={st(i)}
    >
      <Mark id={mark} size={36} className="row-span-3" />
      <span className="flex justify-between text-muted text-xs">
        <span>{app}</span>
        <span>now</span>
      </span>
      <span className="font-semibold">{title}</span>
      <span>{body}</span>
    </div>
  );
}

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
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-6 text-base">
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
      <a
        href="/privacy"
        className="font-semibold underline decoration-hairline-strong underline-offset-4 hover:decoration-current"
      >
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
            <a
              href="https://planetterp.com"
              className="underline decoration-hairline-strong underline-offset-4 hover:decoration-current"
            >
              PlanetTerp
            </a>
          </WithTooltip>
          .
        </span>
        <span>Not affiliated with the University of Maryland.</span>
        <span className="inline-flex flex-wrap items-center gap-2">
          Contact: <ContactEmail />
        </span>
      </div>
    </footer>
  );
}
