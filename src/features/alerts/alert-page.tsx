import type { ReactNode } from "react";
import { Logo } from "~/app/logo";

/** The small centered card the confirm and unsubscribe links land on. */
export function AlertPage({
  title,
  children,
  busy = false,
}: {
  title: string;
  children?: ReactNode;
  busy?: boolean;
}) {
  return (
    <main className="flex min-h-dvh items-start justify-center bg-bg px-4 pt-[18vh] text-fg">
      <div className="w-full max-w-[380px]">
        <a
          href="/"
          className="mb-6 inline-flex rounded-md"
          aria-label="Terpsicle home"
        >
          <Logo />
        </a>
        <section
          aria-live="polite"
          aria-busy={busy}
          className="border border-keyline bg-raised p-6 shadow-pop"
        >
          <h1 className="mb-1.5 font-semibold text-lg tracking-tight">
            {title}
          </h1>
          <div className="space-y-4 text-muted">{children}</div>
        </section>
      </div>
    </main>
  );
}

/** Section code in mono, like everywhere else in the app. */
export function Code({ children }: { children: ReactNode }) {
  return <span className="ident font-medium text-fg">{children}</span>;
}
