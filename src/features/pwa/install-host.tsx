import { lazy, Suspense, useEffect } from "react";
import { captureInstallPrompt, useInstall } from "./install-store";

// Mounted once for every page (src/app/pwa.tsx): keeps the browser's install
// prompt, and shows the dialog when `requestInstallPrompt` or the "Install
// app" item opens it. The dialog's code loads only then.

const InstallDialog = lazy(() =>
  import("./install-dialog").then((m) => ({ default: m.InstallDialog })),
);

export function InstallHost() {
  const open = useInstall((s) => s.open);
  useEffect(() => captureInstallPrompt(), []);
  if (open === null) return null;
  return (
    <Suspense fallback={null}>
      <InstallDialog method={open.method} />
    </Suspense>
  );
}
