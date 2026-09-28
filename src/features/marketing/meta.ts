// What `/` says to search engines and link previews (Messages, Slack,
// Discord). The preview image is drawn from the page's own sample week by
// scripts/build-og-image.ts and committed under public/.

export const SITE_ORIGIN = "https://terpsicle.com";

export const MARKETING_TITLE =
  "Terpsicle: the UMD class scheduler, with reviews, chats and more";

export const MARKETING_DESCRIPTION =
  "Build your UMD class schedule with walking times and seat watches, read instructor reviews, chat with your sections, plan four years and see what's due. Free.";

export const OG_IMAGE = {
  path: "/og.png",
  width: 1200,
  height: 630,
  alt: "A week of UMD classes in Terpsicle's scheduler, beside the marks of its five parts: Schedule, Reviews, Chat, Plan and Todo.",
} as const;

/**
 * Structured data for `/`: the site, who makes it, and the app itself. Only
 * what's true and visible on the page: it's free and runs in a browser. No
 * rating: Terpsicle has no reviews of itself to show.
 */
export const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_ORIGIN}/#website`,
      url: `${SITE_ORIGIN}/`,
      name: "Terpsicle",
      description: MARKETING_DESCRIPTION,
      inLanguage: "en-US",
      publisher: { "@id": `${SITE_ORIGIN}/#organization` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_ORIGIN}/#organization`,
      name: "Terpsicle",
      url: `${SITE_ORIGIN}/`,
      logo: `${SITE_ORIGIN}/icons/icon-512.png`,
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE_ORIGIN}/#app`,
      name: "Terpsicle",
      url: `${SITE_ORIGIN}/`,
      description: MARKETING_DESCRIPTION,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Any (web browser)",
      browserRequirements: "Requires JavaScript.",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      featureList: [
        "Class schedule builder with every section on Testudo",
        "Overlap, walking time and seat checks",
        "Course and instructor reviews with grade distributions",
        "A chat room for every course and section",
        "Four-year plan with credits and GenEd progress",
        "ELMS due dates on a calendar",
      ],
      audience: {
        "@type": "EducationalAudience",
        educationalRole: "student",
        audienceType: "University of Maryland students",
      },
      publisher: { "@id": `${SITE_ORIGIN}/#organization` },
    },
  ],
} as const;
