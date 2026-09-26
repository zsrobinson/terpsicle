import { MODERATION_POLICY } from "~/core/moderation";
import { Breadcrumbs, PageTitle, ReviewsFrame } from "./frame";

// /reviews/policy (V2 §1.1, §7.5): what reviews can say, how checks work,
// removal, and the honest line about what we store. The rules' words are
// MODERATION_POLICY's, the same the composer and moderators read.

export function ReviewsPolicyPage() {
  const policy = MODERATION_POLICY.review;
  return (
    <ReviewsFrame>
      <Breadcrumbs crumbs={[{ label: "Reviews", to: "/reviews" }]} />
      <PageTitle title={policy.title} sub={policy.intro} />
      <article className="space-y-6 leading-relaxed">
        {policy.sections.map((section) => (
          <section key={section.heading} className="space-y-2">
            <h2 className="font-semibold text-lg tracking-tight">
              {section.heading}
            </h2>
            <ul className="list-disc space-y-1 pl-6 text-muted">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
        <section className="space-y-2 text-muted">
          <h2 className="font-semibold text-fg text-lg tracking-tight">
            How checks work
          </h2>
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
        </section>
        <section className="space-y-2 text-muted">
          <h2 className="font-semibold text-fg text-lg tracking-tight">
            Who wrote it
          </h2>
          <p>
            We store which account wrote a review so you can edit or delete it
            and so limits work. We never show it to readers or moderators.
          </p>
        </section>
        <section className="space-y-2 text-muted">
          <h2 className="font-semibold text-fg text-lg tracking-tight">
            PlanetTerp
          </h2>
          <p>
            Ratings and grade distributions include PlanetTerp's, with a link to
            read its reviews there. We don't show PlanetTerp's review text here.
          </p>
        </section>
        <p className="text-faint text-sm">
          Terpsicle isn't affiliated with the University of Maryland.
        </p>
      </article>
    </ReviewsFrame>
  );
}
