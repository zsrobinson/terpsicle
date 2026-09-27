import { Mark } from "./brand/mark";
import { Wordmark } from "./brand/wordmark";

/**
 * The umbrella mark and the wordmark, for pages outside the app's shell.
 * `phoneMark`: the mark alone on phones, where the header is full.
 */
export function Logo({
  compact = false,
  phoneMark = false,
}: {
  compact?: boolean;
  phoneMark?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Mark id="umbrella" size={20} label="Terpsicle" />
      {compact ? null : phoneMark ? (
        <span className="max-sm:hidden">
          <Wordmark />
        </span>
      ) : (
        <Wordmark />
      )}
    </div>
  );
}
