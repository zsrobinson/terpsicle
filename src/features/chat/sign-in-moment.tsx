import { Mark } from "~/app/brand/mark";
import { GoogleButton } from "~/features/auth/sign-in-panel";
import { WithTooltip } from "~/ui/tooltip";

// Chat's front door while you're signed out (V2.md §4.1, §8.6): what Chat
// is, what we keep and what classmates see, before you sign in. Sign-in
// comes back to the same room.

export const CHAT_SIGN_IN_POINTS = [
  "Your rooms come from the plans you sync: a room for the course, your professor's sections and your section.",
  "Classmates see your Google name and picture next to what you write, and in the people list of each of your rooms. They never see your plans.",
  "We keep your messages until the term's rooms close, about ten weeks after classes end, then delete them.",
  "Messages are checked as you send them, and a person reads anything flagged or reported.",
] as const;

export function SignInMoment({ returnTo }: { returnTo: string }) {
  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col gap-4 px-4 pt-[10vh] pb-8">
      <Mark id="chat" size={40} />
      <div>
        <h1 className="font-semibold text-xl tracking-tight">Terpsicle Chat</h1>
        <p className="text-fg">Talk with the people in your classes.</p>
      </div>
      <ul className="flex list-disc flex-col gap-2 pl-4 text-muted">
        {CHAT_SIGN_IN_POINTS.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <GoogleButton returnTo={returnTo} from="chat" />
      <p className="text-muted text-sm">
        The scheduler works without an account, and always will.
      </p>
    </div>
  );
}

/** While CHAT_ENABLED is off (production, for now). */
export function ChatClosed() {
  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col gap-4 px-4 pt-[10vh] pb-8">
      <Mark id="chat" size={40} />
      <h1 className="font-semibold text-xl tracking-tight">Terpsicle Chat</h1>
      <p className="text-muted">
        Chat isn't open yet. When it is, you'll talk with the people in your
        classes here, in rooms for each course and section.
      </p>
      <WithTooltip label="Plan your classes">
        <a
          href="/schedule"
          className="self-start text-fg underline underline-offset-2"
        >
          Open the scheduler
        </a>
      </WithTooltip>
    </div>
  );
}
