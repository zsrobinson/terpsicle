import { useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { FileUp } from "lucide-react";
import { type DragEvent, useId, useState } from "react";
import {
  readTodoFile,
  TODO_FILE_MAX_BYTES,
  TODO_FILE_WORDS,
} from "~/core/todo";
import { track } from "~/lib/analytics";
import { WithTooltip } from "~/ui/tooltip";
import { importTodoFile } from "./todo-mutations";

// "Add a calendar file" (docs/V3.md §3.7): an .ics the student exported
// themselves. It's read here, in the browser, with the same parser as the
// feed; only the structured items go to the server, never the file's text.

const count = (n: number, one: string, many: string) =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** What the import did, in words. */
export function importWords(added: number, skipped: number): string {
  const first =
    added === 0
      ? "Nothing new to add from that file."
      : `Added ${count(added, "deadline", "deadlines")} from the file.`;
  if (skipped === 0) return first;
  return `${first} ${count(skipped, "deadline was", "deadlines were")} already on your ELMS feed or too far from today, so we left ${skipped === 1 ? "it" : "them"} out.`;
}

export function FileDrop() {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inputId = useId();

  const take = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    setBusy(true);
    try {
      // The size first, so a huge file is never read.
      const text = file.size > TODO_FILE_MAX_BYTES ? "" : await file.text();
      const read = readTodoFile(text, file.size);
      if (read.status !== "ok") {
        setMessage(TODO_FILE_WORDS[read.status]);
        return;
      }
      const result = await importTodoFile(client, read.items);
      if (!result) {
        setMessage(
          "That didn't go through. Check your connection and try again.",
        );
        return;
      }
      const skipped = result.skipped + read.skipped;
      track("todo_file_imported", { items: result.added, skipped });
      setMessage(importWords(result.added, skipped));
    } catch {
      setMessage("We couldn't read that file. Try exporting it again.");
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    void take(event.dataTransfer.files[0]);
  };

  return (
    <div className="space-y-2">
      {/* Before its label, so the label can show the input's focus. */}
      <input
        id={inputId}
        type="file"
        accept=".ics,text/calendar"
        title="Choose a calendar file (.ics)"
        className="peer sr-only"
        disabled={busy}
        onChange={(e) => {
          void take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {/* A label, so the whole box opens the file picker too. */}
      <WithTooltip label="Choose a calendar file (.ics) you exported">
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={cn(
            "flex min-h-11 cursor-pointer items-center gap-2 border border-hairline-strong border-dashed px-3 py-3 text-muted transition-colors hover:bg-hover hover:text-fg peer-focus-visible:outline-2 peer-focus-visible:outline-fg peer-focus-visible:outline-offset-2",
            over && "bg-hover text-fg",
            busy && "pointer-events-none opacity-60",
          )}
        >
          <FileUp size={16} aria-hidden="true" />
          <span>
            {busy
              ? "Reading the file…"
              : "Drop an .ics file here, or choose one"}
          </span>
        </label>
      </WithTooltip>
      {message ? (
        <p role="status" className="text-fg text-sm">
          {message}
        </p>
      ) : null}
    </div>
  );
}
