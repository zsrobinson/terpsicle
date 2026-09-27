import { MODERATION_POLICY } from "~/core/moderation";
import { PageHeader } from "~/ui/page-header";
import { PageSection } from "~/ui/page-section";
import { ReviewsFrame } from "./frame";

// /reviews/policy (V2 §1.1, §7.5): what reviews can say, how checks work,
// removal, and the honest line about what we store. The rules' words are
// MODERATION_POLICY's, the same the composer and moderators read.

export function ReviewsPolicyPage() {
  const policy = MODERATION_POLICY.review;
  return (
    <ReviewsFrame>
      <PageHeader
        back={{ label: "Reviews", to: "/reviews" }}
        title={policy.title}
        status={policy.intro}
      />
      {policy.sections.map((section) => (
        <PageSection key={section.heading} title={section.heading}>
          <ul className="list-disc space-y-1 pl-6 text-muted leading-relaxed">
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </PageSection>
      ))}
      <PageSection title="How checks work">
        <div className="space-y-2 text-muted leading-relaxed">
          <p>{policy.process}</p>
          <p>
            We never change a review's words. We post it, hold it for a person,
            or take the whole thing down. If a review is taken down or held, its
            author sees why on their reviews page.
          </p>
          <p>
            Anyone signed in can report a review. A few reports, or one about a
            threat or someone's personal information, hide it until a person
            looks. We pass credible threats to the University of Maryland Police
            (UMPD), without the author's account.
          </p>
        </div>
      </PageSection>
      <PageSection title="Who wrote it">
        <p className="text-muted leading-relaxed">
          We store which account wrote a review so you can edit or delete it and
          so limits work. We never show it to readers or moderators.
        </p>
      </PageSection>
      <PageSection title="PlanetTerp">
        <p className="text-muted leading-relaxed">
          Ratings and grade distributions include PlanetTerp's, with a link to
          read its reviews there. We don't show PlanetTerp's review text here.
        </p>
      </PageSection>
      <p className="text-faint text-sm">
        Terpsicle isn't affiliated with the University of Maryland.
      </p>
    </ReviewsFrame>
  );
}
