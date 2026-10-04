import { X } from "lucide-react";
import { useId, useState } from "react";
import { parseChatMessageRef } from "~/core/moderation/admin";
import type { AdminReason, QueueItem } from "~/core/schema";
import { Button } from "~/ui/button";
import { Card } from "~/ui/card";
import { Input } from "~/ui/input";
import { noteToast } from "~/ui/toast";
import { WithTooltip } from "~/ui/tooltip";
import type { AdminClient } from "./queue-page";
import { StopAuthor } from "./stop-author";
import {
  ADMIN_REASON_WORDS,
  failureWords,
  REMOVE_REASONS,
  stopWords,
} from "./words";

// "Remove a chat message" (V2 §10): for a message the owner found in Chat
// rather than in the queue. Paste its thread link (or a ref from the
// decision log), pick a reason, and it's removed at once like a held item,
// with the same Undo and the same way to stop its author.

export function ChatRemoveForm({
  client,
  onClose,
  onRemoved,
}: {
  client: Pick<AdminClient, "chatRemove">;
  onClose: () => void;
  onRemoved: (item: QueueItem, reason: AdminReason, stop: boolean) => void;
}) {
  const inputId = useId();
  const noteId = useId();
  const [pasted, setPasted] = useState("");
  const [stop, setStop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const target = parseChatMessageRef(pasted);

  const remove = async (reason: AdminReason) => {
    if (!target) {
      setNote(
        "That isn't a message link. Open the message's thread in Chat and copy the address, or paste a ref from the decision log.",
      );
      return;
    }
    setBusy(true);
    try {
      const result = await client.chatRemove({
        courseCode: target.courseCode,
        messageId: target.messageId,
        ...(target.termId ? { termId: target.termId } : {}),
        reason,
        ...(stop ? { authorAction: "stop" } : {}),
      });
      if (result.status === "ok") onRemoved(result.item, reason, stop);
      else
        setNote(
          "That message isn't there, or it's already removed. Its author may have deleted it.",
        );
    } catch (error) {
      noteToast("Couldn't remove that", { description: failureWords(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    // A card: a form that opens over the list, like Reviews' report form.
    <section
      aria-label="Remove a chat message"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <Card>
        <div className="flex items-center gap-2">
          <label htmlFor={inputId} className="font-medium text-base">
            Message link or id
          </label>
          <WithTooltip label="Close (Esc)">
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              aria-label="Close"
              onClick={onClose}
            >
              <X size={14} aria-hidden="true" />
            </Button>
          </WithTooltip>
        </div>
        <WithTooltip label="A thread link from Chat, or a ref from the decision log (term, course and message id)">
          <Input
            id={inputId}
            value={pasted}
            onChange={(event) => {
              setPasted(event.target.value);
              setNote(null);
            }}
            aria-describedby={note ? noteId : undefined}
            placeholder="https://terpsicle.com/chat/CMSC351/0101?thread=…"
            autoComplete="off"
            spellCheck={false}
          />
        </WithTooltip>
        {note ? (
          <p id={noteId} role="status" className="text-muted text-sm">
            {note}
          </p>
        ) : target ? (
          <p className="text-muted text-sm">A message in {target.courseCode}</p>
        ) : null}
        <fieldset
          aria-label="Remove because"
          className="flex flex-wrap items-center gap-1"
        >
          <span aria-hidden="true" className="mr-1 text-muted text-sm">
            Remove because
          </span>
          {REMOVE_REASONS.map((reason) => (
            <WithTooltip
              key={reason}
              label="Remove it for this reason. You can undo."
            >
              <Button
                variant="ghost"
                size="row"
                disabled={busy || pasted.trim() === ""}
                onClick={() => void remove(reason)}
              >
                {ADMIN_REASON_WORDS[reason]}
              </Button>
            </WithTooltip>
          ))}
          <StopAuthor
            label={stopWords("chat")}
            checked={stop}
            onChange={setStop}
          />
        </fieldset>
      </Card>
    </section>
  );
}
