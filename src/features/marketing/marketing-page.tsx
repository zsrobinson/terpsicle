import { OpenScheduleButton, SitePage } from "~/features/site/site-page";

// `/` for first visits: engineering's placeholder until the brand and
// marketing track designs the real page (docs/V2.md §2). Returning visitors
// never see it (returning.ts), except at `/?stay`. Reviews and Chat are
// linked from the header.

const PRODUCTS = [
  {
    name: "Schedule",
    line: "Build your class schedule: search courses, compare sections, and see how far you'll walk between classes.",
  },
  {
    name: "Reviews",
    line: "Read what UMD students say about courses and instructors.",
  },
  {
    name: "Chat",
    line: "Talk with the other students in your classes.",
  },
] as const;

export function MarketingPage() {
  return (
    <SitePage>
      <h1 className="mb-1.5 font-semibold text-xl tracking-tight">Terpsicle</h1>
      <p className="mb-6 text-muted">
        A fast, clear class scheduler for UMD students, with course reviews and
        class chats.
      </p>
      <ul className="mb-6 space-y-3">
        {PRODUCTS.map((p) => (
          <li key={p.name}>
            <h2 className="font-medium text-fg">{p.name}</h2>
            <p className="text-muted">{p.line}</p>
          </li>
        ))}
      </ul>
      <OpenScheduleButton />
    </SitePage>
  );
}
