import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { HomePage } from "~/features/home/home-page";
import { initAnalytics } from "~/lib/analytics";

// Home (docs/V3.md §1.5): the installed app's start page (the manifest's
// `start_url`) and where the bar's wordmark goes: what matters now and
// next, from every product. Crawlers are told to skip it. It reads this
// device's plans and the account's data, so it renders only in the browser.
export const Route = createFileRoute("/home")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Home · Terpsicle" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HomeRoute,
});

function HomeRoute() {
  // Counted like the products' pages; autocapture stays off here
  // (~/core/analytics): Todo's titles and your courses show.
  useEffect(() => {
    void initAnalytics();
  }, []);
  return <HomePage />;
}
