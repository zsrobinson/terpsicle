import { Copy, ExternalLink, Mail } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { termLabel } from "~/core/catalog/terms";
import {
  GRADE_REPORT_COLUMNS,
  gradeRequestText,
  PIA_EMAIL,
  PIA_PORTAL,
} from "~/core/grades/requests";
import type { AdminGradeSemester } from "~/core/schema/admin";
import { adminApi } from "~/server/fns/admin-api";
import { Button } from "~/ui/button";
import { InlineError } from "~/ui/inline-error";
import { Input, Textarea } from "~/ui/input";
import { ListRow } from "~/ui/list-row";
import { PageHeader } from "~/ui/page-header";
import { PageSection } from "~/ui/page-section";
import { RowSkeleton } from "~/ui/skeleton";
import { noteToast } from "~/ui/toast";
import { WithTooltip } from "~/ui/tooltip";
import { AdminNav, PAGE_ROW } from "./admin-frame";
import { failureWords, useLoad } from "./use-load";

// `/admin/grades` (V2 §10; owner, 2026-09-28: "something about the
// semesters that need importing, and maybe a bit of info on a standard
// request to send"). The grades Reviews shows are PlanetTerp's, which it
// gets from the university each semester with a Maryland Public
// Information Act request. This lists the semesters whose grades aren't in
// yet, with a place to note when each request went out, and the words of a
// standard request (src/core/grades/requests.ts).

export type GradesClient = Pick<typeof adminApi, "grades" | "gradesSave">;

/** PlanetTerp's importer, which says what the university's file looks like. */
const IMPORTER_URL =
  "https://github.com/planetterp/PlanetTerp/blob/master/home/management/commands/importgradedata.py";

export function GradesPage({ client = adminApi }: { client?: GradesClient }) {
  const loaded = useLoad((signal) => client.grades({ signal }), "grades");
  const data = loaded.data;
  const missing = data?.missing ?? [];
  const request = gradeRequestText(missing.map((m) => m.termId));
  return (
    <>
      <PageHeader
        title="Grade data"
        status={
          data
            ? data.gradesThrough
              ? `PlanetTerp's grades run through ${termLabel(data.gradesThrough)}`
              : "PlanetTerp's grades haven't loaded yet"
            : "Semesters to ask the university for"
        }
        views={<AdminNav current="grades" />}
      />

      {loaded.state === "failed" ? (
        <InlineError
          message={`Couldn't load the semesters. ${loaded.message}`}
          onRetry={loaded.reload}
        />
      ) : null}

      <PageSection
        title="Semesters without grades"
        aside={data ? missing.length : undefined}
      >
        {data === null ? (
          loaded.state === "loading" ? (
            <RowSkeleton rows={2} inset={false} label="Loading the semesters" />
          ) : null
        ) : missing.length === 0 ? (
          <p className="text-muted">
            Every finished fall and spring has grades. Nothing to ask for.
          </p>
        ) : (
          <ul>
            {missing.map((m) => (
              <SemesterRow
                key={m.termId}
                semester={m}
                client={client}
                onSaved={loaded.reload}
              />
            ))}
          </ul>
        )}
        <p className="text-faint text-xs">
          Fall and spring only: the university's releases leave out summer and
          winter.
        </p>
      </PageSection>

      {missing.length > 0 ? (
        <PageSection title="The request">
          <p>
            Send it to the Office of General Counsel, at{" "}
            <span className="font-medium">{PIA_EMAIL}</span> or through{" "}
            <WithTooltip label="The university's Public Information Act form">
              <a
                href={PIA_PORTAL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline underline-offset-2 hover:no-underline"
              >
                its form
                <ExternalLink size={11} aria-hidden="true" />
              </a>
            </WithTooltip>
            . Institutional Research, Planning and Assessment fills it. The
            university has 10 working days to answer.
          </p>
          <RequestText subject={request.subject} body={request.body} />
        </PageSection>
      ) : null}

      <PageSection title="What comes back">
        <p>
          A spreadsheet with a row per section:{" "}
          {GRADE_REPORT_COLUMNS.join(", ")}. Instructors are written "Last,
          First". PlanetTerp's{" "}
          <WithTooltip label="How PlanetTerp reads the university's file, on GitHub">
            <a
              href={IMPORTER_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline underline-offset-2 hover:no-underline"
            >
              importer
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          </WithTooltip>{" "}
          reads it this way. Terpsicle doesn't import these files yet: the pages
          show PlanetTerp's grades.
        </p>
      </PageSection>
    </>
  );
}

/** One semester: when its request went out, and a note. */
function SemesterRow({
  semester,
  client,
  onSaved,
}: {
  semester: AdminGradeSemester;
  client: GradesClient;
  /** Reads the list again, so the row shows what's stored. */
  onSaved: () => void;
}) {
  const [sentOn, setSentOn] = useState(semester.sentOn ?? "");
  const [note, setNote] = useState(semester.note);
  const [saving, setSaving] = useState(false);
  const ids = { sent: useId(), note: useId() };
  useEffect(() => {
    setSentOn(semester.sentOn ?? "");
    setNote(semester.note);
  }, [semester]);
  const changed = sentOn !== (semester.sentOn ?? "") || note !== semester.note;
  const save = async () => {
    setSaving(true);
    try {
      await client.gradesSave({
        termId: semester.termId,
        sentOn: sentOn || null,
        note: note.trim(),
      });
      noteToast(`Saved ${termLabel(semester.termId)}.`);
      onSaved();
    } catch (error) {
      noteToast(`Couldn't save. ${failureWords(error)}`, { retry: save });
    } finally {
      setSaving(false);
    }
  };
  return (
    <ListRow as="li" align="start" className={PAGE_ROW}>
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="font-medium">{termLabel(semester.termId)}</div>
          <div className="text-muted text-sm">
            {semester.sentOn ? `Asked on ${semester.sentOn}` : "Not asked yet"}
          </div>
        </div>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label htmlFor={ids.sent} className="sr-only">
            When the request went out
          </label>
          <WithTooltip label="When the request went out">
            <Input
              id={ids.sent}
              type="date"
              value={sentOn}
              onChange={(e) => setSentOn(e.target.value)}
              className="w-40"
            />
          </WithTooltip>
          <label htmlFor={ids.note} className="sr-only">
            Note
          </label>
          <WithTooltip label="A reference number, or what came back">
            <Input
              id={ids.note}
              value={note}
              maxLength={500}
              placeholder="Note"
              onChange={(e) => setNote(e.target.value)}
              className="w-56 max-md:flex-1"
            />
          </WithTooltip>
          <WithTooltip label={`Save ${termLabel(semester.termId)}`}>
            <Button
              type="submit"
              variant="outline"
              disabled={!changed || saving}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </WithTooltip>
        </form>
      </div>
    </ListRow>
  );
}

/** The request's words, to copy or to open in your email. */
function RequestText({ subject, body }: { subject: string; body: string }) {
  const id = useId();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${body}`);
      noteToast("Copied the request.");
    } catch {
      noteToast("Couldn't copy. Select the words and copy them instead.");
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <p>
        <span className="text-muted">Subject:</span> {subject}
      </p>
      <label htmlFor={id} className="sr-only">
        The request
      </label>
      <Textarea id={id} readOnly rows={14} value={body} />
      <div className="flex flex-wrap gap-2">
        <WithTooltip label="Copy the subject and the words">
          <Button variant="outline" onClick={() => void copy()}>
            <Copy aria-hidden="true" />
            Copy
          </Button>
        </WithTooltip>
        <WithTooltip label={`A new email to ${PIA_EMAIL}, filled in`}>
          <Button
            variant="outline"
            render={
              <a
                href={`mailto:${PIA_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
              />
            }
          >
            <Mail aria-hidden="true" />
            Open in email
          </Button>
        </WithTooltip>
      </div>
    </div>
  );
}
