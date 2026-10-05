import { Download, FileUp } from "lucide-react";
import { type ReactNode, useId, useRef, useState } from "react";
import { track } from "~/lib/analytics";
import { Button } from "~/ui/button";
import { InlineError } from "~/ui/inline-error";
import { ListRow } from "~/ui/list-row";
import { PageSection } from "~/ui/page-section";
import { noteToast, undoToast } from "~/ui/toast";
import { WithTooltip } from "~/ui/tooltip";
import type { DataWho, PreparedImport } from "./actions";

// Settings → "Your data" (docs/DATA.md §5.6): download everything you've
// made as one file, add a file back, and (signed in) delete your account.
// Adding shows what it would do first, inline, never in a dialog; once
// added, Undo takes it out again (DESIGN.md §5).

/** The actions load on the first click: Settings' first load carries none of it. */
const actions = () => import("./actions");

const FAILED = "That didn't go through. Check your connection and try again.";

/** How many of something, in words. */
const count = (n: number, one: string, many: string) =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export function YourDataSection({
  who,
  children,
}: {
  who: DataWho;
  /** Rows after these (Settings puts Delete account here, signed in). */
  children?: ReactNode;
}) {
  return (
    <PageSection title="Your data">
      <div>
        <DownloadRow who={who} />
        <AddRow who={who} />
        {children}
      </div>
    </PageSection>
  );
}

/**
 * One row of the section: what it does on the left, its button on the
 * right, and under the words what it says back (an error, a preview).
 */
export function DataRow({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: ReactNode;
  action: ReactNode;
  children?: ReactNode;
}) {
  return (
    <ListRow align="start" className="px-0" trail={action}>
      <span className="font-medium text-fg">{title}</span>
      <p className="emph-secondary mt-0.5 text-sm">{description}</p>
      {children}
    </ListRow>
  );
}

function DownloadRow({ who }: { who: DataWho }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const download = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const name = await (await actions()).downloadData(who);
      track("data_downloaded", { from: who.signedIn ? "account" : "browser" });
      noteToast(`Downloaded ${name}`, {
        id: "your-data",
        description: "Keep it somewhere safe: it has your grades in it.",
      });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <DataRow
        title="Download your data"
        description={
          who.signedIn
            ? "Your plans, four-year plans with grades, settings, Todo tasks, seat watches, notification settings, class chats with the messages you wrote, and your reviews, in one file."
            : "The plans, four-year plans and settings in this browser, in one file. Sign in to include your account's too."
        }
        action={
          <WithTooltip label="Downloads a .json file you can add back later">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void download()}
            >
              <Download aria-hidden="true" />
              {busy ? "Getting it ready…" : "Download"}
            </Button>
          </WithTooltip>
        }
      >
        {failed ? <InlineError message={FAILED} className="pb-0" /> : null}
      </DataRow>
    </>
  );
}

type AddState =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "error"; message: string }
  | { kind: "preview"; prepared: Prepared }
  | { kind: "adding"; prepared: Prepared };

/** A file read, and what adding it would do (`prepareImport`). */
type Prepared = Extract<PreparedImport, { status: "ok" }>;

function AddRow({ who }: { who: DataWho }) {
  const [state, setState] = useState<AddState>({ kind: "idle" });
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const where = who.signedIn ? "your account" : "this browser";

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setState({ kind: "reading" });
    try {
      const prepared = await (await actions()).prepareImport(file, who);
      setState(
        prepared.status === "ok"
          ? { kind: "preview", prepared }
          : { kind: "error", message: prepared.message },
      );
    } catch {
      setState({ kind: "error", message: FAILED });
    } finally {
      // The same file can be chosen again.
      if (input.current) input.current.value = "";
    }
  };

  const add = async (prepared: Prepared) => {
    setState({ kind: "adding", prepared });
    try {
      const { applyImport, undoApplied } = await actions();
      const applied = await applyImport(prepared.file, who);
      const counts = {
        plans: applied.plan.added.plans.length,
        fourYear: applied.plan.added.fourYear.length,
        tasks: applied.taskUids.length,
      };
      track("data_file_added", counts);
      setState({ kind: "idle" });
      undoToast({
        id: "your-data",
        message: addedMessage(counts, applied.plan.settingsChanged),
        description:
          applied.tasksLeftOut > 0
            ? `${count(applied.tasksLeftOut, "task wasn't", "tasks weren't")} added: Todo keeps 500 at most, with dates from 30 days back to a year ahead.`
            : `Undo takes it out of ${where} again.`,
        tooltip: "Take out what the file added",
        onUndo: () => {
          track("data_file_undone", {});
          void undoApplied(applied).catch(() =>
            noteToast("We couldn't undo that", {
              id: "your-data",
              description: FAILED,
            }),
          );
        },
      });
    } catch {
      setState({ kind: "error", message: FAILED });
    }
  };

  const busy = state.kind === "reading" || state.kind === "adding";
  return (
    <>
      {/* Before the button that opens it; the button is its label. */}
      <input
        ref={input}
        id={inputId}
        type="file"
        accept=".json,application/json"
        title="Choose a Terpsicle data file (.json)"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => void choose(event.target.files?.[0])}
      />
      <DataRow
        title="Add a data file"
        description={`Adds the ${who.signedIn && who.todo ? "plans, four-year plans, settings and Todo tasks" : "plans, four-year plans and settings"} from a file you downloaded here to ${where}. Nothing you have is replaced: a plan that's different in the file is added as a copy.`}
        action={
          <WithTooltip label="Choose a Terpsicle data file (.json)">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              <FileUp aria-hidden="true" />
              {state.kind === "reading" ? "Reading…" : "Choose file"}
            </Button>
          </WithTooltip>
        }
      >
        {state.kind === "error" ? (
          <InlineError message={state.message} className="pb-0" />
        ) : null}
        {state.kind === "preview" || state.kind === "adding" ? (
          <ImportPreview
            prepared={state.prepared}
            where={where}
            adding={state.kind === "adding"}
            onAdd={() => void add(state.prepared)}
            onCancel={() => setState({ kind: "idle" })}
          />
        ) : null}
      </DataRow>
    </>
  );
}

function addedMessage(
  counts: { plans: number; fourYear: number; tasks: number },
  settings: boolean,
): string {
  const parts = [
    counts.plans > 0 && count(counts.plans, "plan", "plans"),
    counts.fourYear > 0 &&
      count(counts.fourYear, "four-year plan", "four-year plans"),
    counts.tasks > 0 && count(counts.tasks, "task", "tasks"),
  ].filter((p): p is string => typeof p === "string");
  if (parts.length === 0)
    return settings ? "Added the file's settings" : "Nothing new to add";
  const last = parts.pop();
  return `Added ${parts.length > 0 ? `${parts.join(", ")} and ${last}` : last}`;
}

/** How many names the preview lists before "and n more". */
const SHOWN = 6;

/** What adding the file would do, before it does it. */
function ImportPreview({
  prepared,
  where,
  adding,
  onAdd,
  onCancel,
}: {
  prepared: Prepared;
  where: string;
  adding: boolean;
  onAdd: () => void;
  onCancel: () => void;
}) {
  const { plan, summary, names } = prepared;
  const same = plan.same.plans + plan.same.fourYear;
  const nothing = names.length === 0 && !plan.settingsChanged;
  return (
    <div
      data-private=""
      aria-live="polite"
      className="mt-3 flex flex-col gap-2 border-hairline-strong border-l-2 py-0.5 pl-3"
    >
      <p className="font-medium text-fg">{summary}</p>
      {names.length > 0 ? (
        <ul className="flex flex-col gap-0.5 text-sm text-muted">
          {names.slice(0, SHOWN).map((name) => (
            <li key={name} className="truncate">
              {name}
            </li>
          ))}
          {names.length > SHOWN ? (
            <li>and {names.length - SHOWN} more</li>
          ) : null}
        </ul>
      ) : null}
      {same > 0 || (plan.settingsChanged && names.length > 0) ? (
        <p className="text-sm text-muted">
          {[
            same > 0 &&
              `${count(same, "plan is", "plans are")} already here, the same.`,
            plan.settingsChanged &&
              names.length > 0 &&
              "Settings you don't have yet, like course colors and blocks, are added; yours stay.",
          ]
            .filter(Boolean)
            .join(" ")}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {nothing ? null : (
          <WithTooltip label={`Adds these to ${where}. Undo takes them out.`}>
            <Button size="sm" disabled={adding} onClick={onAdd}>
              {adding
                ? "Adding…"
                : where === "your account"
                  ? "Add to your account"
                  : "Add to this browser"}
            </Button>
          </WithTooltip>
        )}
        <WithTooltip label="Leaves everything as it is">
          <Button
            variant="ghost"
            size="sm"
            disabled={adding}
            onClick={onCancel}
          >
            {nothing ? "Done" : "Cancel"}
          </Button>
        </WithTooltip>
      </div>
    </div>
  );
}
