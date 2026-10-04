import type { ReactNode } from "react";
import { PageHeader } from "~/ui/page-header";
import { PageSection } from "~/ui/page-section";
import { WithTooltip } from "~/ui/tooltip";
import { ContactEmail } from "./contact-email";
import { SitePage } from "./site-page";

// `/privacy`: Google's OAuth consent screen links here, and brand
// verification checks that it loads (docs/V2.md §14). A draft for the owner
// to review. Keep it true to the app as built and planned (docs/V2.md, the
// owner's decisions), with nothing added that isn't.

/** One part of the policy: the kit's section, with prose in it. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <PageSection title={title} className="text-fg">
      <div className="flex flex-col gap-3 text-muted">{children}</div>
    </PageSection>
  );
}

export function PrivacyPage() {
  return (
    <SitePage layout="reading">
      <PageHeader title="Privacy" status="Draft, last updated 2026-09-27" />
      <article className="flex flex-col gap-6 text-muted leading-relaxed">
        <div className="flex flex-col gap-3">
          <p>
            Terpsicle is a set of planning tools for University of Maryland
            students: Schedule, Reviews, Chat, Plan and Todo. This page says
            what it keeps about you, where, and why. Terpsicle isn't affiliated
            with the University of Maryland.
          </p>
          <p className="font-medium text-fg">
            We don't sell or share your data.
          </p>
          <p>
            The services named below (Google for sign-in, Cloudflare for hosting
            and moderation, PostHog for anonymous analytics, and your browser's
            push service) handle it only to run Terpsicle for you.
          </p>
        </div>

        <Section title="Schedule">
          <p>
            Your plans, blocks and settings are saved in your browser, on your
            device. Nothing about them is sent to Terpsicle unless you sign in.
            Loading courses, seats and reviews doesn't tell Terpsicle who you
            are.
          </p>
          <p>
            A share link carries a copy of your plan inside the link itself.
            Terpsicle doesn't store it, and anyone with the link can see that
            plan.
          </p>
        </Section>

        <Section title="Signing in">
          <p>
            Schedule works without an account. To sign in, you use your UMD
            Google account (umd.edu or terpmail.umd.edu). Terpsicle keeps your
            name and your UMD email address from Google. Your directory ID (the
            part of your email before the @) identifies your account. Terpsicle
            doesn't collect or show your profile picture: your initials stand in
            for it.
          </p>
          <p>
            Once you sign in, your plans and settings (like the day Todo's weeks
            start) sync to your account, so they follow you to your other
            devices. Synced plans are stored on Terpsicle's servers, encrypted
            at rest. Terpsicle sets one cookie to keep you signed in, and no
            other cookies.
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
            Class chats show your real name (and your initials, never a picture)
            to the other students in the room. Messages are stored so the room
            keeps its history. The same kind of moderation model checks messages
            for serious abuse, such as threats, hate and spam, and holds those
            for the moderator to review. To catch one message posted across many
            courses, Terpsicle keeps a fingerprint of each message (which can't
            be turned back into its words), with its course and time, for an
            hour. A term's rooms become read-only 10 days after classes end, and
            are deleted 60 days after that.
          </p>
        </Section>

        <Section title="Plan">
          <p>
            Your four-year plan is saved in your browser. If you're signed in,
            it's also saved on our server so it's on your other devices. That
            includes any grades you imported. Nobody else can see your plan or
            your grades, and we don't use them for anything else.
          </p>
          <p>
            When you paste your unofficial transcript, it's read in your browser
            and never saved or sent to us. Only the courses you import are
            saved: each one's code (if it has one) and title as the transcript
            prints it, whether it was a UMD course, AP, an exam or transfer
            credit, its semester, credits and GenEds, and its grade if you keep
            grades. Your name, UID, birth date, the schools you transferred from
            and the rest of the page aren't kept anywhere.
          </p>
        </Section>

        <Section title="Todo">
          <p>
            To show your deadlines, we keep your ELMS calendar link on our
            server, encrypted, and check it about every 20 minutes. We store the
            assignments and events it lists (titles, courses and due dates),
            which ones you've marked done, and any courses you hide. We don't
            get your grades, submissions or ELMS password, and we never sign in
            to ELMS or Gradescope for you. Disconnect any time and we delete the
            link and everything from it at once.
          </p>
          <p>
            If you add a calendar file, it's read in your browser. Only the
            deadlines in it are sent to us, never the file itself.
          </p>
          <p>
            Tasks you add yourself are kept on our server too (what you type,
            and the course and due date you pick), so they're on your other
            devices. They never go to ELMS, and nobody else can see them. Delete
            one any time.
          </p>
        </Section>

        <Section title="Seat watches and notifications">
          <p>
            When you watch a full section, Terpsicle tells you by web push and
            email once a seat opens; chat notifications work the same way. To
            send them, Terpsicle keeps your seat watches, your email address,
            your browser's push subscription and your notification settings.
            Push messages pass through your browser maker's push service. The
            notification settings page lets you turn each kind on or off, for
            push and email separately.
          </p>
          <p>
            If you subscribe to your calendar feed, your calendar app fetches
            your classes and Todo deadlines from a private link, without signing
            in. Anyone with the link can see those dates, so keep it to
            yourself. We store only a one-way hash of it and when a calendar
            last fetched it, never the link in a log or analytics. "Make a new
            link" in the notification settings stops the old one at once.
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
            link (encrypted), the deadlines from it, the tasks you add in Todo
            and your done marks. To limit abuse, Terpsicle counts requests per
            network using a one-way hash of your IP address, never the address
            itself.
          </p>
        </Section>

        <Section title="Deleting your account">
          <p>
            You can delete your account in Settings. Terpsicle waits 7 days, in
            case you change your mind (signing in cancels it), then deletes your
            profile, synced plans, notification settings, seat watches, chat
            messages, your calendar feed link, and your ELMS link, deadlines,
            own tasks and done marks. Your calendar feed stops working as soon
            as you delete your account. Reviews you posted stay up with no name
            attached; delete them first if you want them gone. Plans saved in
            your browser stay until you remove them.
          </p>
        </Section>

        <Section title="Contact">
          <p>Questions about your data, or a request to delete it:</p>
          <ContactEmail Tooltip={WithTooltip} />
        </Section>
      </article>
    </SitePage>
  );
}
