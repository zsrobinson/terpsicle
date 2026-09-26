// What `/` says to search engines and link previews (Messages, Slack,
// Discord). The preview image is drawn from the page itself by
// scripts/build-og-image.ts and committed under public/.

export const SITE_ORIGIN = "https://terpsicle.com";

export const MARKETING_TITLE =
  "Terpsicle: the UMD class scheduler, with reviews, chats and more";

export const MARKETING_DESCRIPTION =
  "Build your UMD class schedule with travel time and seat watching, read course and instructor reviews, and chat with your sections. Free, no account needed for the scheduler.";

export const OG_IMAGE = {
  path: "/og.png",
  width: 1200,
  height: 630,
  alt: "Five tangled lines straighten into five rails, one per part of Terpsicle: Schedule, Reviews, Chat, Plan and Todo.",
} as const;

/** Structured data for `/`: the site, and who makes it. */
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
  ],
} as const;
