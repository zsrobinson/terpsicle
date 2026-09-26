import { INLINE_SCRIPTS } from "virtual:terpsicle/inline-scripts";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { SCHEDULE_PATH } from "~/core/routing";
import { MarketingPage } from "~/features/marketing/marketing-page";
import {
  MARKETING_DESCRIPTION,
  MARKETING_TITLE,
  OG_IMAGE,
  SITE_ORIGIN,
} from "~/features/marketing/meta";
import { skipMarketingInBrowser } from "~/features/marketing/returning";

// The marketing page, server-rendered so it shows without the app's code.
// Returning visitors skip it (docs/V2.md §2): a session cookie at the Worker
// (src/server/routing.ts); the returning flag or saved plans in the head
// script on a full load, or in `beforeLoad` when the router navigates here.
// `/?stay` always shows it. The head script's text is the build's
// (src/app/inline-scripts.ts), so the CSP's hash matches it.
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: MARKETING_TITLE },
      { name: "description", content: MARKETING_DESCRIPTION },
      { property: "og:title", content: MARKETING_TITLE },
      { property: "og:description", content: MARKETING_DESCRIPTION },
      { property: "og:url", content: `${SITE_ORIGIN}/` },
      { property: "og:image", content: `${SITE_ORIGIN}${OG_IMAGE.path}` },
      { property: "og:image:alt", content: OG_IMAGE.alt },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `${SITE_ORIGIN}/` }],
    scripts: [{ children: INLINE_SCRIPTS.returningCheck }],
  }),
  beforeLoad: async ({ location }) => {
    if (await skipMarketingInBrowser(location.searchStr))
      throw redirect({ to: SCHEDULE_PATH, replace: true });
  },
  component: MarketingPage,
});
