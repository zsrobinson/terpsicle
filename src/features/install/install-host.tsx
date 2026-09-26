import { lazy, Suspense, useEffect } from "react";
import { captureInstallPrompt, useInstall } from "./install-store";

// Mounted once for every page (src/routes/__root.tsx): keeps the browser's
// install prompt, and shows the dialog when `offerInstall` or the "Install
// app" entry opens it. The dialog's code loads only then.

const InstallDialog = lazy(() =>
  import("./install-dialog").then((m) => ({ default: m.InstallDialog })),
);

export function InstallHost() {
  const open = useInstall((s) => s.open);
  useEffect(() => captureInstallPrompt(), []);
  if (open === null) return null;
  return (
    <Suspense fallback={null}>
      <InstallDialog from={open} />
    </Suspense>
  );
}
