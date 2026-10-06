import { PageHeader } from "~/ui/page-header";
import { WithTooltip } from "~/ui/tooltip";
import { ContactEmail } from "./contact-email";
import {
  LEGAL_UPDATED,
  LegalSection,
  ProseLink,
  ProseOutsideLink,
  REPO_URL,
} from "./legal";
import { SitePage } from "./site-page";

// `/terms`: the rules for using Terpsicle, and its protections (docs/
// decisions.md, "Privacy and terms in plain words; open source is the
// proof"). Plain words, like `/privacy`, and written from what's built:
// people post in Chat (Reviews live on PlanetTerp), so these cover Chat
// and feedback. Move LEGAL_UPDATED with any change in substance.

export function TermsPage() {
  return (
    <SitePage layout="reading">
      <PageHeader
        title="Terms of use"
        status={`Last updated ${LEGAL_UPDATED}`}
      />
      <article className="flex flex-col gap-6 text-muted leading-relaxed">
        <p>
          These are the rules for using Terpsicle, in plain words. By using it,
          you agree to them. If you don't, please don't use Terpsicle. What we
          keep about you, and why, is in{" "}
          <ProseLink
            to="/privacy"
            tooltip="What Terpsicle keeps about you, and why"
          >
            Privacy
          </ProseLink>
          .
        </p>

        <LegalSection title="Who we are">
          <p>
            Terpsicle is a free, open-source student project: planning tools for
            University of Maryland students. It isn't affiliated with, run by or
            endorsed by the University of Maryland, and it doesn't speak for
            UMD.
          </p>
        </LegalSection>

        <LegalSection title="Using it">
          <p>
            Schedule and Plan work without an account. To sign in, you need your
            own UMD Google account: one account per person, and don't sign in
            for someone else or let them use yours.
          </p>
          <p>
            Don't scrape Terpsicle, automate it, flood it with requests or try
            to break it, and don't use it to spam anyone. If you want to build
            on it,{" "}
            <ProseOutsideLink
              href={REPO_URL}
              tooltip="Terpsicle's code on GitHub. Opens in a new tab."
            >
              the code is open source
            </ProseOutsideLink>
            .
          </p>
        </LegalSection>

        <LegalSection title="Accuracy">
          <p>
            Course data comes from Testudo, and ratings, reviews and grade data
            from PlanetTerp. We copy them carefully, but they can be wrong or
            out of date. Check Testudo before you register.
          </p>
          <p>
            Seat notifications aren't guaranteed: one can come late, or not at
            all. Schedules Terpsicle generates and four-year plans you make are
            suggestions, not advice; your advisor and your degree audit have the
            final word. Todo shows what ELMS lists, so check ELMS when it
            matters.
          </p>
        </LegalSection>

        <LegalSection title="What you post">
          <p>
            You're responsible for what you post in Chat and send as feedback.
            Your name is on every chat message. Don't post harassment, threats,
            hate, sexual content, other people's private details, false
            statements of fact about real people, spam, or anything illegal.
            Reviews are written on PlanetTerp, under its rules.
          </p>
          <p>
            We can remove anything that breaks these rules, and stop someone who
            breaks them from posting in Chat. We also keep the right to close an
            account that breaks them. We'll usually say why, but we don't have
            to.
          </p>
        </LegalSection>

        <LegalSection title="Permission">
          <p>
            You keep what you write. You give Terpsicle permission to store it,
            show it to the people it's meant for (a class chat's members), and
            process it to run Terpsicle, like checking messages for abuse and
            sorting feedback. We don't sell it. When you delete your account,
            your chat messages go with it. Feedback you sent stays, with no name
            on it.
          </p>
        </LegalSection>

        <LegalSection title="Reporting">
          <p>
            To report a chat message, use its … menu: a person reads every
            report, and nobody sees who sent it. For anything else, like a
            takedown request or something posted about you, email us:
          </p>
          <ContactEmail Tooltip={WithTooltip} />
        </LegalSection>

        <LegalSection title="The legal part">
          <p>
            Terpsicle comes as it is, with no warranty of any kind. As far as
            the law allows, we aren't liable for anything that comes from using
            it, like a missed registration, a wrong seat count, a missed
            deadline or lost data.
          </p>
          <p>
            We can change Terpsicle, or stop running it, at any time. When we
            change these terms, the date at the top changes, and using Terpsicle
            after that means you accept the new ones.
          </p>
          <p>
            These terms are governed by the laws of the State of Maryland. The
            code itself is under the MIT License; these terms cover using
            Terpsicle, not the code.
          </p>
        </LegalSection>
      </article>
    </SitePage>
  );
}
