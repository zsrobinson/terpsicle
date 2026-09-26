// What `/` says to search engines and link previews (Messages, Slack,
// Discord). The preview image is drawn from the page itself by
// scripts/build-og-image.ts and committed under public/.

export const SITE_ORIGIN = "https://terpsicle.com";

export const MARKETING_TITLE =
  "Terpsicle: planning tools for your semester at Maryland";

export const MARKETING_DESCRIPTION =
  "Build your UMD class schedule, choose with the grades and reviews, and talk to your sections. The scheduler doesn't need an account.";

export const OG_IMAGE = {
  path: "/og.png",
  width: 1200,
  height: 630,
  alt: "Five tangled lines straighten into Terpsicle's five parts: Schedule, Reviews, Chat, Plan and Todo.",
} as const;
