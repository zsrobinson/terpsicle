import type { ReactNode } from "react";
import { Logo } from "~/app/logo";

/**
 * The frame for /settings and /signin: the logo home, a title, and one
 * column. Pages outside the scheduler stay this plain until the brand
 * track's design lands.
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
    <main className="flex min-h-dvh items-start justify-center bg-bg px-4 pt-[12vh] pb-6 text-fg">
      <div className="w-full max-w-[440px]">
        <a
          href="/"
          className="mb-6 inline-flex rounded-md"
          aria-label="Terpsicle home"
        >
          <Logo />
        </a>
        <h1 className="mb-4 font-semibold text-xl tracking-tight">{title}</h1>
        <div aria-live="polite" aria-busy={busy} className="space-y-4">
          {children}
        </div>
      </div>
    </main>
  );
}

/** A bordered group with a small heading, like a panel section. */
export function AccountSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-hairline bg-raised p-4">
      <h2 className="mb-3 font-semibold text-base">{title}</h2>
      <div className="space-y-4 text-muted">{children}</div>
    </section>
  );
}
