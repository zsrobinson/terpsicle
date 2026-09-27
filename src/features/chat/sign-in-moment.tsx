import { Mark } from "~/app/brand/mark";
import { SCHEDULE_PATH } from "~/core/routing";
import { GoogleButton } from "~/features/auth/sign-in-panel";
import { EmptyState } from "~/ui/empty-state";
import { PageHeader } from "~/ui/page-header";
import { PageSection } from "~/ui/page-section";
import { ProductPage } from "~/ui/product-page";

// Chat's front door while you're signed out (V2.md §4.1, §8.6): the kit's
// first visit, then what we keep and what classmates see, before you sign
// in. Sign-in comes back to the same room.

export const CHAT_SIGN_IN_POINTS = [
  "Your rooms come from the plans you sync: a room for the course, your professor's sections and your section.",
  "Classmates see your Google name and picture next to what you write, and in the people list of each of your rooms. They never see your plans.",
  "We keep your messages until the term's rooms close, about ten weeks after classes end, then delete them.",
  "Messages are checked as you send them, and a person reads anything flagged or reported.",
] as const;

export function SignInMoment({ returnTo }: { returnTo: string }) {
  // The kit's first visit, with Google's own button as its one action: the
  // sign-in start is the Worker's address, not a route, so it isn't an
  // `EmptyState` action (yet).
  return (
    <ProductPage width="note">
      <Mark id="chat" size={40} />
      <PageHeader
        title="Terpsicle Chat"
        status="Talk with the people in your classes. Sign in to see your rooms."
        className="border-b-0 pb-0"
      />
      <div className="self-start">
        <GoogleButton returnTo={returnTo} from="chat" />
      </div>
      <PageSection title="Before you sign in" className="mt-4">
        <ul className="flex list-disc flex-col gap-2 pl-4 text-muted">
          {CHAT_SIGN_IN_POINTS.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <p className="text-muted text-sm">
          The scheduler works without an account, and always will.
        </p>
      </PageSection>
    </ProductPage>
  );
}

/** While CHAT_ENABLED is off (production, for now). */
export function ChatClosed() {
  return (
    <ProductPage width="note">
      <EmptyState
        headingLevel={1}
        mark={<Mark id="chat" size={40} />}
        title="Chat isn't open yet"
        line="When it is, you'll talk with the people in your classes here, in rooms for each course and section."
        primary={{
          label: "Open the scheduler",
          hint: "Plan your classes",
          to: SCHEDULE_PATH,
        }}
      />
    </ProductPage>
  );
}
