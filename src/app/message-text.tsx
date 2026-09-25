import { Fragment } from "react";
import type { Message } from "~/core/schema";
import { DAY_LONG_NAMES, formatDuration, formatTime } from "~/core/time";

/**
 * Core's structured words (`Message`), rendered: codes, times and durations
 * in Geist Mono, everything else as text (core/README.md).
 */
export function MessageText({ message }: { message: Message }) {
  return (
    <>
      {message.map((part, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and never reorder
        <Fragment key={i}>{renderPart(part)}</Fragment>
      ))}
    </>
  );
}

/** The same words as plain text (tooltips, aria labels). */
export function messageToText(message: Message): string {
  return message
    .map((part) => {
      switch (part.kind) {
        case "text":
          return part.text;
        case "course":
          return part.courseCode;
        case "section":
          return part.sectionKey.replace("-", " ");
        case "block":
          return part.label;
        case "day":
          return DAY_LONG_NAMES[part.day];
        case "time":
          return formatTime(part.minutes);
        case "duration":
          return formatDuration(part.minutes);
      }
      return "";
    })
    .join("");
}

function renderPart(part: Message[number]) {
  if (part.kind === "text" || part.kind === "block" || part.kind === "day")
    return messageToText([part]);
  return <span className="font-mono">{messageToText([part])}</span>;
}
