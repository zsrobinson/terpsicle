import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { loadRecoveryScript } from "~/app/load-recovery";
import { themeInitScript } from "~/app/theme";
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
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  shellComponent: RootDocument,
  component: RootLayout,
});

// The HTML shell is server-rendered (theme before first paint, fonts, CSS);
// the app route itself renders only in the browser (`ssr: false`).
function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: our own constant script; it must run before paint */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: our own constant script; it must listen before the app's scripts load */}
        <script dangerouslySetInnerHTML={{ __html: loadRecoveryScript }} />
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
      <Outlet />
      <Toaster />
    </TooltipProvider>
  );
}
