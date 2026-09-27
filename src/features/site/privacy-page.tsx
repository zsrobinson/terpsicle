import type { ReactNode } from "react";
import { ContactEmail } from "./contact-email";
import { SitePage } from "./site-page";

// `/privacy`: Google's OAuth consent screen links here, and brand
// verification checks that it loads (docs/V2.md §14). A draft for the owner
// to review. Keep it true to the app as built and planned (docs/V2.md, the
// owner's decisions), with nothing added that isn't.

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold text-fg text-lg tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

export function PrivacyPage() {
  return (
    <SitePage>
      <article className="space-y-6 text-muted leading-relaxed">
        <header className="space-y-1.5">
          <h1 className="font-semibold text-fg text-xl tracking-tight">
            Privacy
          </h1>
          <p className="text-sm">Draft, last updated 2026-09-27</p>
        </header>

        <p>
          Terpsicle is a class scheduler for University of Maryland students,
          with course reviews and class chats. This page says what it keeps
          about you, where, and why. Terpsicle isn't affiliated with the
          University of Maryland.
        </p>
        <p className="font-medium text-fg">We don't sell or share your data.</p>
        <p>
          The services named below (Google for sign-in, Cloudflare for hosting
          and moderation, PostHog for anonymous analytics, and your browser's
          push service) handle it only to run Terpsicle for you.
        </p>

        <Section title="The scheduler">
          <p>
            Your plans, blocks and settings are saved in your browser, on your
            device. Nothing about them is sent to Terpsicle unless you sign in.
            Loading courses, seats and review summaries doesn't tell Terpsicle
            who you are.
          </p>
          <p>
            A share link carries a copy of your plan inside the link itself.
            Terpsicle doesn't store it, and anyone with the link can see that
            plan.
          </p>
        </Section>

        <Section title="Signing in">
          <p>
            The scheduler works without an account. To sign in, you use your UMD
            Google account (umd.edu or terpmail.umd.edu). Google gives Terpsicle
            your name, your UMD email address and your profile picture. Your
            directory ID (the part of your email before the @) identifies your
            account. Terpsicle keeps its own copy of your picture and shows it
            only to people who are signed in.
          </p>
          <p>
            Once you sign in, your plans sync to your account, so they follow
            you to your other devices. Synced plans are stored on Terpsicle's
            servers, encrypted at rest. Terpsicle sets one cookie to keep you
            signed in, and no other cookies.
          </p>
          <p>
            If Google says your organization blocked Terpsicle, UMD's Google
            settings stopped it.
          </p>
        </Section>

        <Section title="Reviews">
          <p>
            Anyone can read reviews. Writing one needs a sign-in, which shows
            you have a UMD account. Readers never see who wrote a review, but
            Terpsicle stores the author to prevent abuse, such as one person
            posting many reviews.
          </p>
          <p>
            An automated moderation model (Meta's Llama models, run by
            Cloudflare) checks each review before it's published. If it isn't
            sure, Terpsicle's moderator reads the review without seeing who
            wrote it.
          </p>
        </Section>

        <Section title="Chat">
          <p>
            Class chats show your real name and Google profile picture to the
            other students in the room. Messages are stored so the room keeps
            its history. The same kind of moderation model checks messages and
            holds ones that break the rules, such as answers to graded work, for
            the moderator to review. A term's rooms become read-only 10 days
            after classes end, and are deleted 60 days after that.
          </p>
        </Section>

        <Section title="Plan">
          <p>
            Your four-year plan is saved in your browser, and for now nowhere
            else: it doesn't reach our server, even when you're signed in.
            Nobody else can see it, and we don't use it for anything.
          </p>
        </Section>

        <Section title="Todo">
          <p>
            To show your deadlines, we keep your ELMS calendar link on our
            server, encrypted, and check it about every 20 minutes. We store the
            assignments and events it lists (titles, courses and due dates) and
            which ones you've marked done. We don't get your grades, submissions
            or ELMS password, and we never sign in to ELMS or Gradescope for
            you. Disconnect any time and we delete the link and everything from
            it at once.
          </p>
          <p>
            If you add a calendar file, it's read in your browser. Only the
            deadlines in it are sent to us, never the file itself.
          </p>
        </Section>

        <Section title="Seat alerts and notifications">
          <p>
            When you watch a full section, Terpsicle tells you by web push and
            email once a seat opens; chat notifications work the same way. To
            send them, Terpsicle keeps your seat watches, your email address,
            your browser's push subscription and your notification settings.
            Push messages pass through your browser maker's push service. The
            notification settings page lets you turn each kind on or off, for
            push and email separately.
          </p>
        </Section>

        <Section title="Feedback">
          <p>
            "Send feedback" sends us what you write. Two boxes, on unless you
            turn them off, add more:
          </p>
          <ul className="list-disc space-y-1 pl-6">
            <li>
              <span className="text-fg">Include what I was doing</span> adds the
              app's version, your browser, screen size, theme and whether you
              were online, the page you were on, your open plan and settings,
              and the last 50 or so things you did in Terpsicle: pages you
              opened, buttons you used, errors the app hit and requests that
              failed. That list stays in the page's memory and is sent only with
              your feedback.
            </li>
            <li>
              <span className="text-fg">Include a screenshot</span> adds a
              picture of the page. Names, pictures, messages, reviews and your
              block labels are blacked out before the picture exists, and you
              can black out or crop more before sending.
            </li>
          </ul>
          <p>
            Feedback never includes your ELMS calendar link, sign-in or
            notification tokens, a share link's plan, other people's messages or
            reviews, or grades you pasted into Plan. It isn't linked to your
            account unless you're signed in and turn on "You can reply by
            email"; then we keep who sent it so we can email you once when it's
            fixed.
          </p>
          <p>
            To sort similar feedback together, we send its words (never the
            screenshot or what you were doing) to an AI model that runs on
            Cloudflare, where Terpsicle runs.
          </p>
          <p>
            Screenshots are deleted 180 days after you send them, or 30 days
            after we mark your feedback done, whichever comes first. Everything
            else is deleted after a year. Right after sending, Undo takes it
            back completely.
          </p>
        </Section>

        <Section title="Analytics">
          <p>
            Terpsicle uses PostHog to count which parts of the app people use.
            It's anonymous: it isn't linked to your name or account, it sets no
            cookies, and PostHog never receives your IP address. It sees actions
            like opening a tab or adding a course, never what you type, and
            never what you write in reviews or chats. A share link's plan never
            reaches it: PostHog only learns that a shared plan was opened.
          </p>
          <p>
            Terpsicle doesn't record sessions. Nobody can play back what you did
            on a page.
          </p>
        </Section>

        <Section title="Hosting">
          <p>
            Terpsicle runs on Cloudflare, which stores synced plans, reviews,
            messages, seat watches, notification settings, your ELMS calendar
            link (encrypted), the deadlines from it and your done marks. To
            limit abuse, Terpsicle counts requests per network using a one-way
            hash of your IP address, never the address itself.
          </p>
        </Section>

        <Section title="Deleting your account">
          <p>
            You can delete your account in Settings. Terpsicle waits 7 days, in
            case you change your mind (signing in cancels it), then deletes your
            profile and picture, synced plans, notification settings, seat
            watches, chat messages, and your ELMS link, deadlines and done
            marks. Reviews you posted stay up with no name attached; delete them
            first if you want them gone. Plans saved in your browser stay until
            you remove them.
          </p>
        </Section>

        <Section title="Contact">
          <p>Questions about your data, or a request to delete it:</p>
          <ContactEmail />
        </Section>
      </article>
    </SitePage>
  );
}
