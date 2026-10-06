import { EyeOff, LockKeyhole, MonitorSmartphone } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader } from "~/ui/page-header";
import { WithTooltip } from "~/ui/tooltip";
import { ContactEmail } from "./contact-email";
import {
  LEGAL_UPDATED,
  LegalSection,
  NamedList,
  ProseLink,
  ProseOutsideLink,
  REPO_URL,
} from "./legal";
import { SitePage } from "./site-page";

// `/privacy`: Google's OAuth consent screen links here, and brand
// verification checks that it loads (docs/V2.md §14). Written from what's
// built (docs/DATA.md §7.7, docs/decisions.md's privacy entries): change it
// in the same PR as anything it describes, and move LEGAL_UPDATED with it.
// Never call the encryption end-to-end (CLAUDE.md).

/** The three lines at the top: the whole page, for people who read no more. */
const SUMMARY: readonly { icon: typeof EyeOff; text: string }[] = [
  {
    icon: MonitorSmartphone,
    text: "Without an account, everything you make stays in your browser.",
  },
  {
    icon: LockKeyhole,
    text: "Signed in, it syncs to your account, encrypted with your account's own key.",
  },
  {
    icon: EyeOff,
    text: "We don't sell or share your data, and analytics are anonymous.",
  },
];

/** How long each thing is kept: one table, backups included. */
const KEPT: readonly [what: string, howLong: string][] = [
  [
    "Plans, four-year plans and settings",
    "Until you delete them, or your account",
  ],
  [
    "Tasks you add in Todo",
    "Until you delete them, or 30 days after they're due",
  ],
  [
    "Your ELMS link, and the deadlines from it",
    "Until you disconnect; each deadline until 30 days after it's due",
  ],
  ["Seat watches", "Until you stop watching, or the term ends"],
  ["Notifications in the bell", "30 days"],
  ["A record of each notification we sent, without its words", "90 days"],
  ["Chat messages", "Until the room is deleted, 70 days after classes end"],
  ["A message's fingerprint, against spam", "1 hour"],
  [
    "The moderator's copy of a held or reported message",
    "30 days after it's decided",
  ],
  [
    "Feedback",
    "1 year; a screenshot 180 days, or 30 days after we fix what it's about",
  ],
  ["Staying signed in", "30 days after you last use Terpsicle"],
  ["Your account", "Until you delete it, then 7 days to change your mind"],
  ["Database backups", "30 days"],
];

export function PrivacyPage() {
  return (
    <SitePage layout="reading">
      <PageHeader title="Privacy" status={`Last updated ${LEGAL_UPDATED}`} />
      <article className="flex flex-col gap-6 text-muted leading-relaxed">
        <div className="flex flex-col gap-4">
          <p>
            Terpsicle is a set of free planning tools for University of Maryland
            students: Schedule, Reviews, Chat, Plan and Todo. This page says
            what we keep about you, why, where it lives, who else touches it,
            how long we keep it and how to delete it. Terpsicle isn't affiliated
            with the University of Maryland.
          </p>
          <ul aria-label="In short" className="flex flex-col gap-2">
            {SUMMARY.map(({ icon: Icon, text }) => (
              <li key={text} className="flex gap-3 text-base text-fg">
                <Icon
                  size={16}
                  aria-hidden="true"
                  className="mt-1 shrink-0 text-muted"
                />
                {text}
              </li>
            ))}
          </ul>
        </div>

        <LegalSection title="On your device">
          <p>
            Schedule and Plan work without an account. Your plans, blocks,
            four-year plans and settings are saved in your browser, on your
            device, and nothing about them is sent to us unless you sign in.
            Loading courses, seats and ratings doesn't tell us who you are.
          </p>
          <p>
            When you paste your unofficial transcript into Plan, it's read in
            your browser and never sent to us. Only the courses you import are
            kept: each one's code (if it has one) and title as the transcript
            prints it, whether it was a UMD course, AP, an exam or transfer
            credit, its semester, credits and GenEds, and its grade if you keep
            grades. Your name, UID, birth date, the schools you transferred from
            and the rest of the page aren't kept anywhere.
          </p>
        </LegalSection>

        <LegalSection title="Signing in">
          <p>
            You sign in with your UMD Google account (umd.edu or
            terpmail.umd.edu). Google gives us your name and UMD email address,
            and we keep both. Your directory ID (the part of your email before
            the @) identifies your account. We don't collect or show your
            profile picture: your initials stand in for it. We never get your
            mail, your files or your password.
          </p>
          <p>
            Signing in sets a cookie that keeps you signed in, for up to 30 days
            after you last use Terpsicle. Two more help sign-in itself: one
            lasts 10 minutes while Google answers, and one remembers which UMD
            address you used, so Google can suggest it next time (signing out
            clears it). We set no other cookies, and none for ads or tracking.
          </p>
          <p>
            If Google says your organization blocked Terpsicle, UMD's Google
            settings stopped it.
          </p>
        </LegalSection>

        <LegalSection title="What syncs, and how it's protected">
          <p>
            Signed in, what you make syncs to your account, so it's on your
            other devices: your plans and blocks, four-year plans with any
            grades you imported, your settings, and the tasks you add in Todo.
            Nobody else can see them. There's no switch to sync less: to keep
            something off our server, use Terpsicle signed out.
          </p>
          <p>
            We store them encrypted, with a key made for your account alone
            (AES-256-GCM) and kept apart from the data. A copy of our database
            without that key can't be read, and deleting your account destroys
            the key.
          </p>
          <p>
            It isn't end-to-end encryption. Our server can open your data,
            because a few features need it to: Chat reads your main plan to find
            your class rooms, and your calendar feed reads it to list your
            classes. We don't open it for anything else, and{" "}
            <ProseOutsideLink
              href={REPO_URL}
              tooltip="Terpsicle's code on GitHub. Opens in a new tab."
            >
              the code
            </ProseOutsideLink>{" "}
            shows it.
          </p>
          <p>
            A few things stay readable so those features work: the sections in
            your main plan (Chat's rooms come from them), which terms you have
            plans in and when you saved, and your tasks' due dates and courses,
            but not what they say.
          </p>
        </LegalSection>

        <LegalSection title="What you share">
          <p>
            <Lead>Chat.</Lead> Class chats show your real name, with your
            initials, to the other students in the room. Which rooms you're in
            comes from your main plan. Your messages are stored so the room
            keeps its history. A term's rooms become read-only 10 days after
            classes end, and are deleted 60 days after that.
          </p>
          <p>
            <Lead>Reviews.</Lead> Reviews live on PlanetTerp. Schedule shows
            PlanetTerp's public ratings, reviews and grade data, with credit and
            a link, from a copy our server updates each night. We don't send
            PlanetTerp anything about you. The Reviews tab opens planetterp.com,
            where PlanetTerp's own privacy policy applies.
          </p>
          <p>
            <Lead>Share links.</Lead> A share link carries a copy of your plan
            inside the link itself. We don't store it, and anyone with the link
            can see that plan.
          </p>
        </LegalSection>

        <LegalSection title="Things we do for you">
          <p>
            <Lead>Notifications.</Lead> When you watch a full section, we let
            you know when a seat opens, by push and email. Mentions and replies
            in Chat, and Todo's Due tomorrow, work the same way. To send them,
            we keep your seat watches, your email address, your browser's push
            subscription, your notification settings and what's in the bell.
            Push messages pass through your browser maker's push service.
            Settings lets you turn each kind on or off, for push and email
            separately.
          </p>
          <p>
            <Lead>Todo.</Lead> To show your deadlines, we keep your ELMS
            calendar link on our server, encrypted, and check it about every 20
            minutes. We store the assignments and events it lists (titles,
            courses and due dates), which ones you've marked done, and any
            courses you hide. We don't get your grades, submissions or ELMS
            password, and we never sign in to ELMS or Gradescope for you.
            Disconnect any time and we delete the link and everything from it at
            once. If you add a calendar file instead, it's read in your browser,
            and only the deadlines in it are sent to us. Tasks you add yourself
            never go to ELMS.
          </p>
          <p>
            <Lead>Your calendar feed.</Lead> If you subscribe to it, your
            calendar app fetches your classes and Todo deadlines from a private
            link, without signing in. Anyone with the link can see those dates,
            so keep it to yourself. We store only a one-way hash of it and when
            a calendar last fetched it, never the link in a log or analytics.
            "Make a new link" in Settings stops the old one at once.
          </p>
        </LegalSection>

        <LegalSection title="Moderation and AI">
          <p>
            To keep Chat free of threats, hate and spam, an automated model
            (Meta's Llama models, run by Cloudflare) checks each message. If it
            isn't sure, it holds the message for our moderator, who reads it
            without seeing who wrote it. Reports go to the moderator too, and
            nobody sees who sent them. To catch one message posted across many
            courses, we keep a fingerprint of each message (which can't be
            turned back into its words) with its course and time, for an hour.
          </p>
          <p>
            To sort similar feedback together, we send its words (never the
            screenshot or what you were doing) to a model run by Cloudflare.
          </p>
          <p>
            These models run on Cloudflare, where Terpsicle runs, not at an AI
            company. Cloudflare doesn't train models on what we send, and
            neither do we.
          </p>
        </LegalSection>

        <LegalSection title="Analytics and feedback">
          <p>
            We use PostHog to count which parts of the app people use. It's
            anonymous: it isn't linked to your name or account, it sets no
            cookies, and PostHog never receives your IP address. It sees actions
            like opening a tab or adding a course, never what you type, and
            never what you write in chats. A share link's plan never reaches it:
            PostHog only learns that a shared plan was opened. We don't record
            sessions, so nobody can play back what you did on a page.
          </p>
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
            notification tokens, a share link's plan, other people's messages,
            or grades you pasted into Plan. It isn't linked to your account
            unless you're signed in and turn on "You can reply by email"; then
            we keep who sent it so we can email you once when it's fixed. Right
            after sending, Undo takes it back completely.
          </p>
        </LegalSection>

        <LegalSection title="Who else touches your data">
          <p>
            Only these services, and only to run Terpsicle for you. We never
            sell your data.
          </p>
          <NamedList
            items={[
              {
                name: "Cloudflare",
                children:
                  "hosts Terpsicle: its servers, database and storage, the AI models above, and the emails we send. Like any host, it sees your IP address when you visit. Our own code never keeps it: to limit abuse, we count requests with a one-way hash of it.",
              },
              {
                name: "Google",
                children:
                  "signs you in, and tells us your name and UMD email address.",
              },
              {
                name: "PostHog",
                children: "counts anonymous use of the app, as above.",
              },
              {
                name: "Push services",
                children:
                  "your browser maker's (Apple's, Google's or Mozilla's) deliver push notifications, encrypted for your device.",
              },
              {
                name: "ELMS",
                children:
                  "if you connect it, our server fetches your calendar link from ELMS (umd.instructure.com) to read your deadlines.",
              },
              {
                name: "PlanetTerp",
                children:
                  "our server reads its public data each night. It gets nothing about you.",
              },
            ]}
          />
        </LegalSection>

        <LegalSection title="How long we keep things">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-hairline border-b">
                <th scope="col" className={HEAD_CELL}>
                  What
                </th>
                <th scope="col" className={HEAD_CELL}>
                  How long
                </th>
              </tr>
            </thead>
            <tbody>
              {KEPT.map(([what, howLong]) => (
                <tr
                  key={what}
                  className="border-hairline border-b last:border-b-0"
                >
                  <th
                    scope="row"
                    className="w-1/2 py-2 pr-4 text-left align-top font-normal text-fg"
                  >
                    {what}
                  </th>
                  <td className="py-2 align-top">{howLong}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Cloudflare's backups let us put the database back as it was at any
            moment of the last 30 days, so something you delete can live on in
            them that long. Chat's messages have the same 30 days.
          </p>
        </LegalSection>

        <LegalSection title="Deleting your account">
          <p>
            Under Your data in{" "}
            <ProseLink
              to="/settings"
              tooltip="Download your data, or delete your account"
            >
              Settings
            </ProseLink>
            , you can download everything you've made in Terpsicle as one file,
            and delete your account. Deleting signs you out everywhere, then
            waits 7 days in case you change your mind: signing in keeps the
            account. After that, we delete your profile, your synced plans,
            four-year plans and settings, your Todo tasks and ELMS link with its
            deadlines, your seat watches, notification settings, chat messages
            and calendar feed link. Your calendar feed stops working right away.
            Plans saved in your browser stay until you remove them.
          </p>
          <p>
            Deleting your account destroys its key, so what it encrypted can't
            be read again by anyone, us included, even from a backup. What isn't
            encrypted (the sections of your main plan, which terms you have
            plans in, your tasks' dates, your seat watches, chat messages and
            the rest) can stay in the backups for up to 30 days after it's
            deleted. Feedback you sent stays, with no name on it.
          </p>
        </LegalSection>

        <LegalSection title="Open source, and questions">
          <p>
            Terpsicle is open source, so you don't have to take this page's word
            for it: everything it describes is in{" "}
            <ProseOutsideLink
              href={REPO_URL}
              tooltip="Terpsicle's code on GitHub. Opens in a new tab."
            >
              Terpsicle's code on GitHub
            </ProseOutsideLink>
            . When what we keep changes, this page changes with it, and so does
            the date at the top. The{" "}
            <ProseLink to="/terms" tooltip="The rules for using Terpsicle">
              terms of use
            </ProseLink>{" "}
            cover the rest.
          </p>
          <p>Questions about your data, or a request to delete it:</p>
          <ContactEmail Tooltip={WithTooltip} />
        </LegalSection>
      </article>
    </SitePage>
  );
}

const HEAD_CELL = "py-2 pr-4 text-left font-normal text-muted";

/** A paragraph's subject, in the page's ink: "Chat." */
function Lead({ children }: { children: ReactNode }) {
  return <span className="font-medium text-fg">{children}</span>;
}
