import type { ReactNode } from "react";
import { SitePage } from "./site-page";

// `/privacy`: Google's OAuth consent screen links here, so it must load and
// say plainly what Terpsicle does. A draft for the owner to review; keep it
// true to the app (docs/SPEC.md, the v2 decisions), with nothing added that
// isn't.

/** Where people write to about their data; the owner hasn't picked one yet. */
const CONTACT_EMAIL = "[OWNER CONTACT EMAIL]";

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
          <p className="text-sm">Draft, last updated 2026-09-26</p>
        </header>

        <p>
          Terpsicle is a class scheduler for University of Maryland students,
          with course reviews and class chats. This page says what it keeps
          about you, where, and why. Terpsicle isn't affiliated with the
          University of Maryland.
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
            The scheduler works without an account. To sign in, you use a Google
            account at umd.edu or terpmail.umd.edu. Google gives Terpsicle your
            name, your UMD email address and your profile picture, and your
            directory ID (the part of your email before the @) identifies your
            account.
          </p>
          <p>
            Once you sign in, your plans sync to your account so they follow you
            to other devices. Terpsicle sets one cookie to keep you signed in,
            and no other cookies.
          </p>
        </Section>

        <Section title="Reviews">
          <p>
            Anyone can read reviews. Writing one needs a sign-in, which shows
            you're a UMD student. Readers never see who wrote a review, but
            Terpsicle stores the author to prevent abuse, such as one person
            posting many reviews.
          </p>
          <p>
            An automated moderation model (Meta's Llama models, run by
            Cloudflare) checks each review before it's published. If it flags
            one, Terpsicle's moderator reads it without seeing who wrote it.
          </p>
        </Section>

        <Section title="Chat">
          <p>
            Class chats show your real name and Google profile picture to the
            other students in the room. Messages are stored so the room keeps
            its history. The same kind of moderation model checks messages, and
            holds ones that break the rules, such as answers to graded work, for
            the moderator to review.
          </p>
        </Section>

        <Section title="Seat alerts and notifications">
          <p>
            Seat alerts and chat notifications reach you by email and, if you
            allow it, by web push. Terpsicle keeps your email address and your
            browser's push subscription to send them, and nothing more. Push
            messages pass through your browser maker's push service. The
            notification settings page lets you choose which ones you get and
            how, and every seat-alert email has a link to stop it.
          </p>
        </Section>

        <Section title="Analytics">
          <p>
            Terpsicle uses PostHog to count which parts of the app people use.
            It's anonymous: it isn't linked to your name or account, it sets no
            cookies, and PostHog never receives your IP address. It records
            actions like opening a tab or adding a course, never what you type.
          </p>
        </Section>

        <Section title="Hosting">
          <p>
            Terpsicle runs on Cloudflare, which stores synced plans, reviews,
            messages and alert subscriptions, encrypted at rest. To limit abuse,
            Terpsicle counts requests per network using a one-way hash of your
            IP address, never the address itself.
          </p>
        </Section>

        <Section title="Deleting your account">
          <p>
            You can delete your account at any time. That removes your profile,
            synced plans, notification settings and alert subscriptions. Reviews
            and messages you posted are removed too. Plans saved in your browser
            stay until you clear them.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about your data, or a request to delete it:{" "}
            {CONTACT_EMAIL}.
          </p>
        </Section>
      </article>
    </SitePage>
  );
}
