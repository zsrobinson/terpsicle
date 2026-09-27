import { WithTooltip } from "~/ui/tooltip";

/**
 * "Also stop this author …" (V2 §10), beside a removal's reasons. Reviews
 * or Chat finds who wrote it; the panel only hears when the stop ends.
 */
export function StopAuthor({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="basis-full pt-1">
      {/* To the side, so it never covers the reasons right after a tick. */}
      <WithTooltip
        label="The author isn't shown to you. Undo lifts the stop."
        side="right"
      >
        <label className="flex w-fit items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => onChange(event.target.checked)}
            className="size-3.5 accent-accent"
          />
          {label}
        </label>
      </WithTooltip>
    </div>
  );
}
