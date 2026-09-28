import { cn } from "cn";
import {
  Bell,
  ExternalLink,
  Info,
  Layers,
  MessageSquare,
  MoreHorizontal,
  RefreshCw,
  Search,
  Sparkles,
  Star,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { Mark } from "~/components/brand/mark";
import { ADMIN_KIT_PATH } from "~/core/routing";
import { GEN_ED_LABELS } from "~/core/schema";
import type { KitPart } from "~/core/schema/admin-kit";
import { NO_FILTERS, type SearchFilters } from "~/core/search/filters";
import { Button } from "~/ui/button";
import { Card } from "~/ui/card";
import {
  COURSE_SEARCH_TIP,
  CourseResultRow,
  CourseSearchField,
} from "~/ui/course-search";
import { EmptyState } from "~/ui/empty-state";
import { FilterChips } from "~/ui/filter-chips";
import { InlineError } from "~/ui/inline-error";
import { Input, SearchField } from "~/ui/input";
import { GroupHeader, ListRow } from "~/ui/list-row";
import { PageHeader } from "~/ui/page-header";
import { PageSection } from "~/ui/page-section";
import { PAGE_WIDTH, PageFooter, type PageWidth } from "~/ui/product-page";
import { SegmentedControl } from "~/ui/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/ui/select";
import { Sheet, SheetTitle } from "~/ui/sheet";
import { PageSkeleton, RowSkeleton } from "~/ui/skeleton";
import { Switch } from "~/ui/switch";
import { WithTooltip } from "~/ui/tooltip";
import { type View, ViewSwitch } from "~/ui/view-switch";
import { AdminNav } from "./admin-frame";

// Every piece of the page kit, in every state, for reviewing side by side in
// both themes (docs/COHESION.md §3, Phase 2). The words are real product
// copy, so the kit shows what a page will say, not lorem ipsum. Nothing here
// saves or sends anything.

/** A part of the kit (`?view=`), or all of it. */
export type KitView = KitPart | "all";

const VIEWS: readonly View[] = [
  { id: "all", label: "Everything", to: ADMIN_KIT_PATH, search: {} },
  {
    id: "page",
    label: "Page",
    hint: "Headers, widths, first visits and the footer",
    to: ADMIN_KIT_PATH,
    search: { view: "page" },
  },
  {
    id: "lists",
    label: "Lists",
    hint: "Rows, groups, cards, sections, loading and errors",
    to: ADMIN_KIT_PATH,
    search: { view: "lists" },
  },
  {
    id: "controls",
    label: "Controls",
    hint: "Fields, switches, segmented controls and buttons",
    to: ADMIN_KIT_PATH,
    search: { view: "controls" },
  },
];

type Theme = "system" | "light" | "dark";

/**
 * Shows the kit in one theme while the page is open, without saving it (the
 * saved theme is the scheduler's). Leaving the page puts the saved one back.
 */
function useKitTheme(theme: Theme) {
  useEffect(() => {
    const root = document.documentElement;
    const before = root.classList.contains("dark");
    if (theme !== "system") root.classList.toggle("dark", theme === "dark");
    return () => {
      root.classList.toggle("dark", before);
    };
  }, [theme]);
}

export function KitPage({ view }: { view: KitView }) {
  const [theme, setTheme] = useState<Theme>("system");
  useKitTheme(theme);
  const show = (part: Exclude<KitView, "all">) =>
    view === "all" || view === part;
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Page kit"
        status={
          <>
            Every piece, in every state · the app width (1120)
            <span aria-hidden="true" className="text-faint">
              ·
            </span>
            <a
              href="#kit-widths"
              className="underline decoration-hairline-strong underline-offset-2 hover:text-fg"
            >
              Widths
            </a>
          </>
        }
        views={<AdminNav current="kit" />}
      />
      {/* Admin's pages are the header's switch; the kit's parts and the
          theme it's shown in sit under it, over what they change. */}
      <div className="-mt-4 flex flex-wrap items-center justify-between gap-2">
        <ViewSwitch label="Parts of the kit" views={VIEWS} current={view} />
        <SegmentedControl
          label="Theme"
          value={theme}
          onValueChange={setTheme}
          options={[
            {
              value: "system",
              label: "System",
              hint: "Follow this device's theme",
            },
            { value: "light", label: "Light", hint: "Show the kit light" },
            { value: "dark", label: "Dark", hint: "Show the kit dark" },
          ]}
        />
      </div>
      {show("page") ? <PageParts /> : null}
      {show("lists") ? <ListParts /> : null}
      {show("controls") ? <ControlParts /> : null}
    </div>
  );
}

/** A specimen: a hairline frame with a caption under it. */
function Demo({
  caption,
  className,
  children,
}: {
  caption?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <div className={cn("border border-hairline bg-bg", className)}>
        {children}
      </div>
      {caption ? (
        <figcaption className="text-muted text-sm">{caption}</figcaption>
      ) : null}
    </figure>
  );
}

function Pair({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 lg:grid-cols-2">{children}</div>;
}

// ── Page ────────────────────────────────────────────────────────────────

function PageParts() {
  return (
    <>
      <PageSection title="Page header" aside={'PageHeader size="page"'}>
        <Demo
          className="p-4"
          caption="Title, one status line, the view switch and at most one filled action. On phones it stacks."
        >
          <PageHeader
            title="Deadlines and exams"
            status={
              <>
                6 open · ELMS checked just now
                <WithTooltip label="Check ELMS now">
                  <Button variant="ghost" size="icon-sm" aria-label="Refresh">
                    <RefreshCw size={12} aria-hidden="true" />
                  </Button>
                </WithTooltip>
              </>
            }
            views={
              <ViewSwitch
                label="Todo views"
                current="day"
                views={[
                  {
                    id: "day",
                    label: "By day",
                    hint: "What's due each day",
                    to: ADMIN_KIT_PATH,
                    search: { view: "page" },
                  },
                  {
                    id: "course",
                    label: "By course",
                    hint: "What's due in each course",
                    to: ADMIN_KIT_PATH,
                    search: { view: "page" },
                  },
                  {
                    id: "week",
                    label: "Week",
                    hint: "The week, day by day",
                    to: ADMIN_KIT_PATH,
                    search: { view: "page" },
                  },
                ]}
              />
            }
            actions={
              <WithTooltip label="Open your ELMS dashboard">
                <Button variant="ghost" size="sm">
                  ELMS link
                </Button>
              </WithTooltip>
            }
          />
        </Demo>
        <Demo
          className="p-4"
          caption="With one Back, named for where you came from, and the page's one filled action."
        >
          <PageHeader
            back={{ label: "Reviews", to: "/reviews" }}
            title={
              <>
                <span className="ident">CMSC216</span> · Introduction to
                Computer Systems
              </>
            }
            status={
              <>
                Offered in Spring 2027 ·{" "}
                <a
                  href="/schedule"
                  className="font-medium text-fg underline decoration-hairline-strong underline-offset-2"
                >
                  View schedule
                </a>
              </>
            }
            actions={
              <Button>
                <MessageSquare aria-hidden="true" />
                Write a review
              </Button>
            }
          />
        </Demo>
        <Demo className="p-4" caption="A title alone.">
          <PageHeader title="Settings" />
        </Demo>
      </PageSection>

      <PageSection title="Panel header" aside={'PageHeader size="panel"'}>
        <Pair>
          <Demo caption="48px: 13/18 over a 12px line, the same slots. PanelHeader is this.">
            <PageHeader
              size="panel"
              title="Plan A"
              status="5 courses · 16 credits"
              actions={
                <WithTooltip label="Plan options">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Plan options"
                  >
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                </WithTooltip>
              }
            />
            <PageHeader
              size="panel"
              back={{ label: "Search", to: ADMIN_KIT_PATH }}
              title={
                <>
                  <span className="ident">CMSC216</span> · Section 0103
                </>
              }
              status="24 people · your section"
              actions={
                <WithTooltip label="About this room">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="About this room"
                  >
                    <Info aria-hidden="true" />
                  </Button>
                </WithTooltip>
              }
            />
          </Demo>
          <Demo caption="In a panel, the view switch sits under the header.">
            <PageHeader
              size="panel"
              title="Room info"
              status="CMSC216 · 142 people"
              views={
                <ViewSwitch
                  label="Room info"
                  current="members"
                  views={[
                    {
                      id: "members",
                      label: "Members",
                      to: ADMIN_KIT_PATH,
                      search: { view: "page" },
                    },
                    {
                      id: "rules",
                      label: "Rules",
                      to: ADMIN_KIT_PATH,
                      search: { view: "page" },
                    },
                    {
                      id: "settings",
                      label: "Settings",
                      to: ADMIN_KIT_PATH,
                      search: { view: "page" },
                    },
                  ]}
                />
              }
            />
          </Demo>
        </Pair>
      </PageSection>

      <PageSection title="Widths" aside="ProductPage width=…">
        <div id="kit-widths" className="flex flex-col gap-2">
          {(
            [
              ["note", 560, "Settings, Notifications, sign-in, not found"],
              ["reading", 720, "Reviews, Privacy"],
              ["app", 1120, "Todo"],
              ["full", 1440, "Chat's split, and the workbenches"],
            ] as const satisfies readonly (readonly [
              PageWidth,
              number,
              string,
            ])[]
          ).map(([width, px, who]) => (
            <div key={width} className="flex flex-col gap-1">
              <div
                className="flex h-7 items-center gap-2 border border-hairline-strong bg-panel px-2 text-sm"
                style={{ width: `${(px / 1440) * 100}%` }}
              >
                <span className="font-semibold">{width}</span>
                <span className="tnum text-muted">
                  {width === "full" ? "edge to edge" : `${px}px`}
                </span>
              </div>
              <span className="text-muted text-xs">{who}</span>
            </div>
          ))}
          <p className="text-muted text-sm">
            A page picks one of these and never invents its own. Every width
            starts 16px under the bar with a 16px gutter. Only note and reading
            pages have the footer.
          </p>
        </div>
      </PageSection>

      <PageSection title="First visit and empty" aside="EmptyState">
        <div className="grid gap-4 lg:grid-cols-3">
          <Demo
            className="flex min-h-72 p-4"
            caption="In a pane it centers: one filled action and a quiet link."
          >
            <EmptyState
              align="center"
              mark={<Mark id="chat" size={40} />}
              title="No classes here yet"
              line="Find any course to open its chat, or add classes to a plan and their rooms show up here."
              primary={{
                label: "Find a course",
                icon: <Search aria-hidden="true" />,
                to: "/chat",
              }}
              secondary={{ label: "View schedule", to: "/schedule" }}
            />
          </Demo>
          <Demo
            className="min-h-72 p-4"
            caption="Equal paths: two filled buttons of one size, and a third way as the quiet link. A question every path needs goes between the sentence and the actions."
          >
            <EmptyState
              equal
              mark={<Mark id="plan" size={40} />}
              title="Plan your four years"
              line="Lay out every semester, see your credits add up to 120 and keep track of your GenEds. It's all in this browser, with nothing to sign up for, and a transcript you import never leaves it."
              primary={{ label: "Import your transcript", to: "/plan" }}
              secondary={{ label: "Start from a sample plan", to: "/plan" }}
              quiet={{ label: "or add courses yourself", to: "/plan" }}
            >
              <StartedIn />
            </EmptyState>
          </Demo>
          <Demo
            className="min-h-72"
            caption="In the sidebar it's the panel's body."
          >
            <PageHeader
              size="panel"
              title="Plan A"
              status="0 courses · 0 credits"
            />
            <div className="p-4">
              <EmptyState
                equal
                headingLevel={3}
                mark={<Mark id="schedule" size={40} />}
                title="Build your Spring 2027 schedule"
                line="Two ways to start. You can switch anytime."
                primary={{
                  label: "Search for a course",
                  icon: <Search aria-hidden="true" />,
                  to: "/schedule/search",
                }}
                secondary={{
                  label: "Generate plans",
                  icon: <Layers aria-hidden="true" />,
                  to: "/schedule/generate",
                }}
              />
            </div>
          </Demo>
        </div>
        <Demo
          className="p-4"
          caption="No mark, one action: a page's own empty state."
        >
          <EmptyState
            title="Nothing due"
            line="When ELMS lists an assignment or exam for one of your classes, it shows up here."
            primary={{ label: "Connect ELMS", to: "/todo/connect" }}
          />
        </Demo>
      </PageSection>

      <PageSection title="Footer" aside="PageFooter, on note and reading pages">
        <Demo
          className={PAGE_WIDTH.reading}
          caption="A 40px muted line under a reading column. Feedback isn't here: it's in the bar."
        >
          <PageFooter />
        </Demo>
      </PageSection>
    </>
  );
}

/** EmptyState's question slot, as Plan's first visit asks it. */
function StartedIn() {
  const id = useId();
  const [term, setTerm] = useState("fall-2026");
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="shrink-0 text-muted text-sm">
        I started at UMD in
      </label>
      <Select value={term} onValueChange={setTerm}>
        <WithTooltip label="Your first fall or spring at UMD">
          <SelectTrigger id={id} className="min-w-32">
            <SelectValue />
          </SelectTrigger>
        </WithTooltip>
        <SelectContent>
          <SelectItem value="fall-2025">Fall 2025</SelectItem>
          <SelectItem value="spring-2026">Spring 2026</SelectItem>
          <SelectItem value="fall-2026">Fall 2026</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

// ── Lists ───────────────────────────────────────────────────────────────

/** A course's color dot, as the scheduler draws it. */
function Dot() {
  return (
    <span
      aria-hidden="true"
      className="mt-1.5 block size-2 rounded-full"
      style={{ backgroundColor: "var(--course-blue-dot)" }}
    />
  );
}

function ListParts() {
  const [open, setOpen] = useState(true);
  const [done, setDone] = useState(false);
  return (
    <>
      <PageSection title="List row" aside="ListRow · GroupHeader">
        <Demo caption="lead · primary and secondary · trail · action. Hover is bg-hover; the selected row is bg-accent-soft; previewed is bg-hover.">
          <ul>
            <ListRow
              as="li"
              align="start"
              className="hover:bg-hover"
              lead={<span className="ident font-semibold">0301</span>}
              secondary="Dis M 2–2:50pm · IRB 1207"
              trail={<span className="text-muted">2 left</span>}
              action={
                <WithTooltip label="Watch for a seat">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Watch for a seat"
                  >
                    <Bell aria-hidden="true" />
                  </Button>
                </WithTooltip>
              }
            >
              Lec TuTh 9:30–10:45am · IRB 0318
            </ListRow>
            <ListRow
              as="li"
              align="start"
              state="current"
              lead={<Dot />}
              secondary="Algorithms · J. Whitfield · TuTh + W"
              trail="11 of 120 open"
            >
              <span className="ident font-semibold">CMSC351</span>{" "}
              <span className="ident text-muted">0201</span>
            </ListRow>
            <ListRow
              as="li"
              state="previewed"
              trail={
                <span className="flex items-center gap-2 text-muted">
                  <span className="flex items-center gap-1 text-fg">
                    <Star size={12} aria-hidden="true" />
                    4.5
                  </span>
                  (112) · GPA 3.08
                </span>
              }
            >
              <span className="font-medium">Christopher Kauffman</span>
            </ListRow>
            <ListRow
              as="li"
              align="start"
              lead={
                <WithTooltip label={done ? "Mark as not done" : "Mark done"}>
                  <input
                    type="checkbox"
                    aria-label="Done: Project 2"
                    checked={done}
                    onChange={(e) => setDone(e.target.checked)}
                    className="mt-0.5 size-4 cursor-pointer accent-accent"
                  />
                </WithTooltip>
              }
              secondary="CMSC216 · 11:59pm · From ELMS"
              action={
                <WithTooltip label="Open in ELMS">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Open in ELMS"
                  >
                    <ExternalLink aria-hidden="true" />
                  </Button>
                </WithTooltip>
              }
            >
              <span
                className={cn("font-medium", done && "text-muted line-through")}
              >
                Project 2
              </span>
            </ListRow>
          </ul>
        </Demo>
        <Pair>
          <Demo caption="A plain group bar (a heading) over compact rows.">
            <GroupHeader
              headingLevel={3}
              title={<span className="ident">CMSC216</span>}
              meta="Introduction to Computer Systems"
            />
            <ListRow
              density="compact"
              state="current"
              trail={<span className="text-muted">24 people</span>}
            >
              Section 0103
            </ListRow>
            <ListRow
              density="compact"
              trail={<span className="text-muted">142 people</span>}
            >
              Course room
            </ListRow>
          </Demo>
          <Demo caption="A group that collapses, with its own control at the right.">
            <GroupHeader
              open={open}
              onToggle={() => setOpen((o) => !o)}
              toggleLabel={
                open
                  ? "Hide Grace Kowalczyk's sections"
                  : "Show Grace Kowalczyk's sections"
              }
              title="Grace Kowalczyk"
              meta="★ 4.2 (61) · GPA 3.10"
              right={
                <WithTooltip label="Read Grace Kowalczyk's reviews">
                  <Button variant="ghost" size="row">
                    Reviews
                  </Button>
                </WithTooltip>
              }
            />
            {open ? (
              <>
                <ListRow
                  lead={<span className="ident">0101</span>}
                  trail="Fits"
                >
                  MWF 10–10:50am · CSI 1115
                </ListRow>
                <ListRow
                  lead={<span className="ident">0102</span>}
                  trail="Full"
                >
                  MWF 11–11:50am · CSI 1115
                </ListRow>
              </>
            ) : null}
          </Demo>
        </Pair>
      </PageSection>

      <PageSection title="Card and section" aside="Card · PageSection">
        <Pair>
          <Demo
            className="p-4"
            caption="A card: one object you press or that floats. Keyline, 2px offset, paper."
          >
            <Card className="max-w-md">
              <h3 className="flex flex-wrap items-center gap-1.5 font-semibold">
                <Star size={13} aria-hidden="true" />
                4.5 (112) Christopher Kauffman
                <span className="font-normal text-muted">· GPA 3.08</span>
              </h3>
              <p className="text-muted text-sm">
                <Sparkles
                  size={12}
                  aria-hidden="true"
                  className="mr-1 inline align-[-2px]"
                />
                Students call the lectures clear and the projects heavy. Office
                hours fill up before deadlines.
              </p>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm">
                  Read 112 reviews
                </Button>
              </div>
            </Card>
          </Demo>
          <Demo
            className="p-4"
            caption="A section: a hairline and a small label, never a box."
          >
            <PageSection title="Account" aside="Signed in with Google">
              <div className="flex flex-col">
                <span className="font-medium">Test Student</span>
                <span className="text-muted text-sm">
                  tstudent@terpmail.umd.edu
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm">
                  Sign out
                </Button>
              </div>
            </PageSection>
          </Demo>
        </Pair>
      </PageSection>

      <PageSection
        title="Loading and error"
        aside="RowSkeleton · PageSkeleton · InlineError"
      >
        <Pair>
          <Demo
            className="p-4"
            caption="A page loading: its header, then rows. Never a spinner."
          >
            <PageSkeleton rows={3} label="Loading the kit's sample page" />
          </Demo>
          <Demo caption="Rows loading, in a panel (PanelSkeleton uses this).">
            <RowSkeleton rows={4} label="Loading sample rows" />
          </Demo>
        </Pair>
        <Pair>
          <Demo className="px-4" caption="An error in place, with Try again.">
            <InlineError
              message="ELMS didn't answer. We'll try again in 20 minutes."
              onRetry={() => undefined}
            />
          </Demo>
          <Demo className="px-4" caption="An error where retrying can't help.">
            <InlineError message="This link has expired. Ask for a new one." />
          </Demo>
        </Pair>
        <Pair>
          <Demo
            className="px-4"
            caption="Only a newer version can help: Reload, beside the words."
          >
            <InlineError
              message="Terpsicle was updated. Reload to keep chatting."
              reload
            />
          </Demo>
          <Demo
            className="px-4"
            caption="A retry on its way: Trying…, and no second press."
          >
            <InlineError
              message="Couldn't reach terpsicle.com to load this term's courses. Check your connection and try again."
              onRetry={() => undefined}
              retrying
            />
          </Demo>
        </Pair>
      </PageSection>
    </>
  );
}

// ── Controls ────────────────────────────────────────────────────────────

const KIT_SEARCH_INFO = {
  depts: new Set(["CMSC", "PSYC"]),
  genEds: Object.keys(GEN_ED_LABELS),
};

/** Every product's course search: the box, a chip a token made, the rows. */
function CourseSearchParts() {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<SearchFilters>({
    ...NO_FILTERS,
    genEds: ["DSNS"],
  });
  const [active, setActive] = useState(0);
  return (
    <PageSection
      title="Course search"
      aside="CourseSearchField · FilterChips · CourseResultRow"
    >
      <Demo caption="Schedule, Plan and Generate: type DSNS then space for a chip, Backspace to take it off; ↓ ↑ and Enter move and pick.">
        <div className="flex flex-col gap-2 border-hairline border-b p-4">
          <CourseSearchField
            label="Search courses (kit)"
            query={query}
            onQueryChange={setQuery}
            tokens={{
              info: KIT_SEARCH_INFO,
              filters,
              onFiltersChange: (next) => setFilters(next),
            }}
            count={2}
            active={active}
            onActiveChange={setActive}
            onPick={setActive}
            placeholder="Course, title, instructor or GenEd"
            tooltip={COURSE_SEARCH_TIP.withInstructors}
          />
          <FilterChips
            filters={filters}
            onChange={(next) => setFilters(next)}
          />
        </div>
        <CourseResultRow
          code="PSYC100"
          title="Introduction to Psychology"
          credits={{ min: 3, max: 3 }}
          genEds={["DSHS", "DSNS"]}
          meta="4 sections · 2 fit your plan"
          state={active === 0 ? "previewed" : undefined}
        />
        <CourseResultRow
          code="CMSC498A"
          title="Special Topics in Computer Science"
          credits={{ min: 1, max: 3 }}
          note="★ 4.6"
          meta="MWF 10am–10:50am · Fits"
          state={active === 1 ? "previewed" : undefined}
        />
        <div className="p-2">
          <CourseResultRow
            density="compact"
            code="CMSC351"
            title="Algorithms"
          />
        </div>
      </Demo>
    </PageSection>
  );
}

function ControlParts() {
  const id = useId();
  const [query, setQuery] = useState("CMSC2");
  const [empty, setEmpty] = useState("");
  const [name, setName] = useState("Plan A");
  const [accessible, setAccessible] = useState(true);
  const [push, setPush] = useState(false);
  const [email, setEmail] = useState(true);
  const [pace, setPace] = useState<"slower" | "typical" | "faster">("typical");
  const [routes, setRoutes] = useState<"standard" | "accessible">("accessible");
  const [term, setTerm] = useState("spring");
  const [sheet, setSheet] = useState(false);
  return (
    <>
      <Sheet open={sheet} onOpenChange={setSheet}>
        <PageHeader
          size="panel"
          title={
            <SheetTitle asChild>
              <span>Notifications</span>
            </SheetTitle>
          }
        />
        <p className="px-4 py-3 text-muted text-sm">
          Nothing new. Notifications show up here, pushed or not.
        </p>
      </Sheet>
      <PageSection title="Fields" aside="Input · SearchField">
        <Demo
          className="flex flex-col gap-3 p-4"
          caption="One height (32px, 44px on phones), one border, one focus ring."
        >
          <div className="grid gap-3 md:grid-cols-2">
            <SearchField
              aria-label="Search courses"
              placeholder="Search by code, title or instructor"
              value={empty}
              onChange={(e) => setEmpty(e.target.value)}
              onClear={() => setEmpty("")}
            />
            <SearchField
              aria-label="Search courses, with text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onClear={() => setQuery("")}
            />
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`${id}-name`}
                className="font-medium text-muted text-xs"
              >
                Plan name
              </label>
              <Input
                id={`${id}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`${id}-feed`}
                className="font-medium text-muted text-xs"
              >
                ELMS calendar link (off)
              </label>
              <Input
                id={`${id}-feed`}
                disabled
                placeholder="https://umd.instructure.com/feeds/…"
              />
            </div>
          </div>
        </Demo>
      </PageSection>

      <CourseSearchParts />

      <PageSection title="Switch" aside="Switch">
        <Pair>
          <Demo
            className="p-4"
            caption="A row that is the control: the label, a line and the knob."
          >
            <WithTooltip
              label={
                accessible
                  ? "Use standard routes"
                  : "Use UMD's accessible routes for every trip"
              }
            >
              <Switch
                checked={accessible}
                onCheckedChange={setAccessible}
                className="-mx-2 w-full items-start gap-3 px-2 py-1 hover:bg-hover"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">Accessible routes</span>
                  <span className="mt-0.5 block text-muted text-sm">
                    Ramps, elevators and accessible entrances, from UMD's campus
                    map.
                  </span>
                </span>
              </Switch>
            </WithTooltip>
          </Demo>
          <Demo
            className="flex flex-wrap items-center gap-2 p-4"
            caption="Chips: on, off, and one that can't switch yet (its tooltip says why)."
          >
            {(
              [
                ["Notification", push, setPush, true],
                ["Email", email, setEmail, true],
                ["Text", false, () => undefined, false],
              ] as const
            ).map(([words, on, set, available]) => (
              <WithTooltip
                key={words}
                label={
                  available
                    ? `${on ? "Turn off" : "Turn on"} seat openings by ${words.toLowerCase()}`
                    : "Coming soon"
                }
              >
                <Switch
                  checked={on}
                  unavailable={!available}
                  aria-label={`Seat openings: ${words}`}
                  onCheckedChange={set}
                  className={cn(
                    "h-8 border border-hairline bg-panel px-2 text-fg text-sm",
                    available ? "hover:bg-hover" : "text-muted",
                  )}
                >
                  {words}
                </Switch>
              </WithTooltip>
            ))}
          </Demo>
        </Pair>
      </PageSection>

      <PageSection
        title="Segmented control"
        aside="SegmentedControl · ViewSwitch is its link form"
      >
        <Demo
          className="flex flex-col items-start gap-3 p-4"
          caption="A choice inside a page (a radio group; arrow keys move between segments). Views that are URLs use ViewSwitch, which looks the same."
        >
          <SegmentedControl
            label="Your pace"
            value={pace}
            onValueChange={setPace}
            options={[
              { value: "slower", label: "Slower", hint: "Walk at 2.5 mph" },
              { value: "typical", label: "Typical", hint: "Walk at 3.0 mph" },
              { value: "faster", label: "Faster", hint: "Walk at 3.5 mph" },
            ]}
          />
          <SegmentedControl
            label="Routes"
            value={routes}
            onValueChange={setRoutes}
            options={[
              { value: "standard", label: "Standard" },
              { value: "accessible", label: "Accessible routes" },
            ]}
          />
        </Demo>
      </PageSection>

      <PageSection title="Select and buttons" aside="Select · Button">
        <Demo className="flex flex-wrap items-center gap-3 p-4">
          <Select value={term} onValueChange={setTerm}>
            <WithTooltip label="The term to show">
              <SelectTrigger aria-label="Term">
                <SelectValue />
              </SelectTrigger>
            </WithTooltip>
            <SelectContent>
              <SelectItem value="fall">Fall 2026</SelectItem>
              <SelectItem value="spring">Spring 2027</SelectItem>
            </SelectContent>
          </Select>
          <Button size="lg">Filled, lg</Button>
          <Button>Filled</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="outline" size="sm">
            Outline, sm
          </Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="outline" size="row">
            Row
          </Button>
          <Button disabled>Off</Button>
        </Demo>
      </PageSection>

      <PageSection title="Sheet" aside="Sheet · SheetTitle">
        <Demo
          className="flex flex-col items-start gap-3 p-4"
          caption="What a desktop popover becomes on a phone: a drawer from the bottom edge, named by its panel header."
        >
          <WithTooltip label="Open the sheet from the bottom edge">
            <Button variant="outline" onClick={() => setSheet(true)}>
              Open the sheet
            </Button>
          </WithTooltip>
        </Demo>
      </PageSection>
    </>
  );
}
