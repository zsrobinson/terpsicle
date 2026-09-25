import { cn } from "cn";
import { Fragment } from "react";
import { messageToText } from "~/app/message-text";
import type { Message, MessagePart } from "~/core/schema";
import { WithTooltip } from "~/ui/tooltip";
import { openSubject } from "./actions";

// Core's structured words with codes and times in Geist Mono (core/README.md),
// and courses, sections and blocks as links to what they name. Use it outside
// other buttons; inside one, use `MessageText` (plain).

export function LinkedMessage({
  message,
  className,
}: {
  message: Message;
  className?: string;
}) {
  return (
    <span className={className}>
      {message.map((part, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and never reorder
        <Fragment key={i}>
          <Part part={part} />
        </Fragment>
      ))}
    </span>
  );
}

function Part({ part }: { part: MessagePart }) {
  const text = messageToText([part]);
  switch (part.kind) {
    case "course":
    case "section": {
      const subject =
        part.kind === "course"
          ? ({ kind: "course", courseCode: part.courseCode } as const)
          : ({ kind: "section", sectionKey: part.sectionKey } as const);
      return (
        <PartLink
          label={`Open ${text.split(" ")[0]}`}
          mono
          onClick={() => openSubject(subject)}
        >
          {text}
        </PartLink>
      );
    }
    case "block":
      return (
        <PartLink
          label="Open Blocks"
          onClick={() => openSubject({ kind: "block", blockId: part.blockId })}
        >
          {text}
        </PartLink>
      );
    case "time":
    case "duration":
      // Tabular figures, not Geist Mono: mid-sentence, mono times read as
      // code (the prototype's detail lines are tnum sans).
      return <span className="tnum">{text}</span>;
    default:
      return <>{text}</>;
  }
}

function PartLink({
  label,
  mono = false,
  onClick,
  children,
}: {
  label: string;
  mono?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <WithTooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "relative z-10 rounded-sm underline decoration-hairline-strong underline-offset-2 transition-colors hover:text-fg hover:decoration-fg",
          mono && "font-mono",
        )}
      >
        {children}
      </button>
    </WithTooltip>
  );
}
