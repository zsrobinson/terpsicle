import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
// Not the barrel: its settings page pulls the scheduler's stores into every
// page (scripts/check-bundle.ts keeps them out of `/`).
import { AccountBoot } from "~/features/auth/account-boot";
import { Pwa } from "~/features/pwa/pwa";
import { pwaLinks, pwaMeta, themeColorMeta } from "~/features/pwa/pwa-head";
import { NotFoundPage } from "~/features/site/not-found-page";
import { ActivityLogBoot } from "~/lib/activity-log-boot";
import { InlineScript } from "~/lib/inline-script";
import type { RouterContext } from "~/lib/query-client";
import { SheetIndent } from "~/ui/sheet-indent";
import { Toaster } from "~/ui/sonner";
import { TooltipProvider } from "~/ui/tooltip";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      // `viewport-fit=cover`: edge to edge on an iPhone, under the notch, the
      // home indicator and Safari's toolbars. The bars pad themselves by the
      // safe areas (`--safe-*` in src/styles.css).
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
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
        {/* Ahead of the theme script, which points them at a picked theme
            (syncThemeColor, src/lib/theme.ts). */}
        {themeColorMeta.map(({ scheme, content, media }) => (
          <meta
            key={scheme}
            name="theme-color"
            content={content}
            media={media}
            data-scheme={scheme}
          />
        ))}
        {/* Inline, so they run before paint (the theme, the sidebar's width)
            and before the app's scripts load (load recovery, Zod's config,
            Chrome's install prompt). The CSP allows each by hash:
            src/lib/inline-scripts.ts. */}
        <InlineScript name="theme" />
        <InlineScript name="sidebarWidth" />
        <InlineScript name="loadRecovery" />
        <InlineScript name="zodJitless" />
        <InlineScript name="installPrompt" />
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
      {/* The page scales back behind a sheet; toasts stay put over it. */}
      <SheetIndent>
        <AccountBoot />
        <ActivityLogBoot />
        <Outlet />
        <Pwa />
      </SheetIndent>
      <Toaster />
    </TooltipProvider>
  );
}
