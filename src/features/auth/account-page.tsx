import type { ReactNode } from "react";
import { SitePage } from "~/features/site/site-page";
import { PageHeader } from "~/ui/page-header";

/**
 * The page for /signin and /auth/test: the family bar, a title, and one
 * note-width column, like /settings.
 */
export function AccountPage({
  title,
  children,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  busy?: boolean;
}) {
  return (
    <SitePage>
      <PageHeader title={title} />
      <div aria-live="polite" aria-busy={busy} className="flex flex-col gap-4">
        {children}
      </div>
    </SitePage>
  );
}
