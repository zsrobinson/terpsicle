import { Mark } from "./brand/mark";
import { Wordmark } from "./brand/wordmark";

/** The umbrella mark and the wordmark, for pages outside the app's shell. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Mark id="umbrella" size={20} label="Terpsicle" />
      {compact ? null : <Wordmark />}
    </div>
  );
}
