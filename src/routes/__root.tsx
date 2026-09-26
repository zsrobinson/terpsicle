import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { InlineScript } from "~/app/inline-script";
import { Pwa } from "~/app/pwa";
import { pwaLinks, pwaMeta, themeColorMeta } from "~/app/pwa-head";
// Not the barrel: its settings page pulls the scheduler's stores into every
// page (scripts/check-bundle.ts keeps them out of `/`).
import { AccountBoot } from "~/features/auth/account-boot";
import { NotFoundPage } from "~/features/site/not-found-page";
import { Toaster } from "~/ui/sonner";
import { TooltipProvider } from "~/ui/tooltip";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Terpsicle" },
      {
        name: "description",
        content: "A fast, clear class scheduler for UMD students.",
      },
      ...pwaMeta,
      // Link previews (Messages, Slack, Discord). Pages set their own title;
      // these stay the site's name and line.
      { property: "og:site_name", content: "Terpsicle" },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "Terpsicle" },
      {
        property: "og:description",
        content: "A fast, clear class scheduler for UMD students.",
      },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // The umbrella mark (pnpm tsx scripts/build-icons.ts). The SVG follows
      // the browser's theme; the PNG is for browsers without SVG favicons.
      { rel: "icon", href: "/icons/favicon.svg", type: "image/svg+xml" },
      {
        rel: "icon",
        href: "/icons/favicon-32.png",
        type: "image/png",
        sizes: "32x32",
      },
      {
        rel: "apple-touch-icon",
        href: "/icons/apple-touch-icon.png",
        sizes: "180x180",
      },
      ...pwaLinks,
    ],
  }),
  shellComponent: RootDocument,
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

// The HTML shell is server-rendered (theme before first paint, fonts, CSS);
// the scheduler renders only in the browser (`ssr: false`), while `/` and the
// other static pages render on the server too.
function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Inline, so they run before paint (the theme, the sidebar's width)
            and before the app's scripts load (load recovery, Zod's config,
            Chrome's install prompt). The CSP allows each by hash:
            src/app/inline-scripts.ts. */}
        <InlineScript name="theme" />
        <InlineScript name="sidebarWidth" />
        <InlineScript name="loadRecovery" />
        <InlineScript name="zodJitless" />
        <InlineScript name="installPrompt" />
        {themeColorMeta.map(({ content, media }) => (
          <meta
            key={media}
            name="theme-color"
            content={content}
            media={media}
          />
        ))}
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootLayout() {
  return (
    <TooltipProvider>
      <AccountBoot />
      <Outlet />
      <Toaster />
      <Pwa />
    </TooltipProvider>
  );
}
