import { cn } from "cn";
import { Asterisk, Minus, Plus, X } from "lucide-react";
import { type Ref, useMemo } from "react";
import {
  type CatalogIndex,
  noMatchesMessage,
  sameWildcard,
  wildcardCourses,
  wildcardId,
  wildcardLabel,
  wildcardNoun,
} from "~/core/catalog";
import { defaultCourseColor, resolveCourseColors } from "~/core/color";
import {
  addWildcard,
  draftCourseCodes,
  removeWildcard,
} from "~/core/generate/draft";
import type {
  CourseCode,
  CourseColor,
  GenerateDraftItem,
  GenWildcardItem,
  Plan,
} from "~/core/schema";
import { dotStyle } from "~/features/calendar/tint";
import { newLocalId } from "~/state/ids";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { CourseField } from "./course-field";
import type { DraftUpdate } from "./use-draft";

// The courses to generate from (SPEC §3.9): each Required or Optional, plus
// "pick N of these" groups. Solid chips are required, dashed optional, as in
// the prototype.

type PickItem = Extract<GenerateDraftItem, { kind: "pick" }>;

export function CourseList({
  items,
  update,
  index,
  complete,
  termName,
  colors,
  plan,
  inputRef,
}: {
  items: readonly GenerateDraftItem[];
  update: DraftUpdate;
  index: CatalogIndex | undefined;
  /** The whole term has loaded, so a missing course really isn't offered. */
  complete: boolean;
  termName: string;
  colors: Readonly<Partial<Record<CourseCode, CourseColor>>>;
  /** The open plan, for "Add Plan A's courses". */
  plan: Plan | null;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const listed = useMemo(() => new Set(draftCourseCodes(items)), [items]);
  const setItems = (
    change: (items: GenerateDraftItem[]) => GenerateDraftItem[],
  ) => update((d) => ({ ...d, items: change([...d.items]) }));

  const fromPlan = (plan?.courses ?? []).filter(
    (c) => !listed.has(c.courseCode),
  );
  // Courses without a stored color still come out distinct in the list.
  const resolved = resolveCourseColors(
    [...listed, ...fromPlan.map((c) => c.courseCode)],
    colors,
  );
  const chip = (code: CourseCode) => ({
    color: resolved[code] ?? defaultCourseColor(code, []),
    missing: complete && index !== undefined && !index.courses.has(code),
  });

  return (
    <div className="flex flex-col gap-2 px-4">
      <CourseField
        index={index}
        exclude={listed}
        label="Add a course"
        placeholder="Add CMSC351, CMSC4XX, DSHS, or title words"
        inputRef={inputRef}
        onAdd={(courseCode) =>
          setItems((xs) => [
            ...xs,
            { kind: "course", courseCode, required: true },
          ])
        }
        wildcards={{
          onAdd: (wildcard) => setItems((xs) => addWildcard(xs, wildcard)),
          complete,
          termName,
        }}
      />
      {items.some((i) => i.kind !== "pick") ? (
        <ul aria-label="Courses" className="flex flex-wrap gap-1">
          {items.map((item) =>
            item.kind === "wildcard" ? (
              <WildcardChip
                key={wildcardId(item.wildcard)}
                item={item}
                matches={
                  complete && index
                    ? wildcardCourses(index.courses.values(), item.wildcard, {
                        exclude: listed,
                      }).length
                    : null
                }
                termName={termName}
                onToggle={() =>
                  setItems((xs) =>
                    xs.map((x) =>
                      x.kind === "wildcard" &&
                      sameWildcard(x.wildcard, item.wildcard)
                        ? { ...x, required: !x.required }
                        : x,
                    ),
                  )
                }
                onRemove={() =>
                  setItems((xs) => removeWildcard(xs, item.wildcard))
                }
              />
            ) : item.kind === "course" ? (
              <CourseChip
                key={item.courseCode}
                courseCode={item.courseCode}
                required={item.required}
                termName={termName}
                {...chip(item.courseCode)}
                onToggle={() =>
                  setItems((xs) =>
                    xs.map((x) =>
                      x.kind === "course" && x.courseCode === item.courseCode
                        ? { ...x, required: !x.required }
                        : x,
                    ),
                  )
                }
                onRemove={() =>
                  setItems((xs) =>
                    xs.filter(
                      (x) =>
                        !(
                          x.kind === "course" &&
                          x.courseCode === item.courseCode
                        ),
                    ),
                  )
                }
              />
            ) : null,
          )}
        </ul>
      ) : null}
      {items.map((item) =>
        item.kind === "pick" ? (
          <PickGroup
            key={item.id}
            group={item}
            index={index}
            exclude={listed}
            termName={termName}
            chip={chip}
            onChange={(next) =>
              setItems((xs) =>
                next
                  ? xs.map((x) =>
                      x.kind === "pick" && x.id === item.id ? next : x,
                    )
                  : xs.filter((x) => !(x.kind === "pick" && x.id === item.id)),
              )
            }
          />
        ) : null,
      )}
      {items.length > 0 ? (
        <p className="text-xs text-faint">
          Solid is required, dashed is optional. Click a course to switch.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {plan && fromPlan.length > 0 ? (
          <WithTooltip
            label={`Adds ${fromPlan.map((c) => c.courseCode).join(", ")}: placed courses required, saved ones optional`}
          >
            <Button
              variant="outline"
              size="sm"
              className="text-sm"
              onClick={() =>
                setItems((xs) => [
                  ...xs,
                  ...fromPlan.map(
                    (c): GenerateDraftItem => ({
                      kind: "course",
                      courseCode: c.courseCode,
                      required: c.sectionCode !== null,
                    }),
                  ),
                ])
              }
            >
              <Plus className="size-3.5" />
              {plan.name}'s courses
            </Button>
          </WithTooltip>
        ) : null}
        <WithTooltip label="For requirements like any 1 of these 3 humanities courses">
          <Button
            variant="outline"
            size="sm"
            className="text-sm"
            onClick={() =>
              setItems((xs) => [
                ...xs,
                { kind: "pick", id: newLocalId(), count: 1, courses: [] },
              ])
            }
          >
            <Plus className="size-3.5" />
            Pick N of these
          </Button>
        </WithTooltip>
      </div>
    </div>
  );
}

function CourseChip({
  courseCode,
  required,
  color,
  missing,
  termName,
  onToggle,
  onRemove,
}: {
  courseCode: CourseCode;
  /** null inside a pick group: neither required nor optional. */
  required: boolean | null;
  color: CourseColor;
  missing: boolean;
  termName: string;
  onToggle?: () => void;
  onRemove: () => void;
}) {
  const body = (
    <>
      <span className="size-2 shrink-0 rounded-full" style={dotStyle(color)} />
      {courseCode}
    </>
  );
  const chipClass = cn(
    "flex h-7 items-center gap-1.5 rounded-l-md border border-r-0 pr-1 pl-2 ident text-sm",
    required === false
      ? "border-hairline-strong border-dashed text-muted"
      : "border-hairline-strong bg-hover font-semibold",
    missing && "text-faint line-through",
  );
  const status = missing
    ? `Not offered in ${termName}`
    : required === null
      ? null
      : required
        ? "Required: every plan includes it. Click to make it optional."
        : "Optional: added when it fits. Click to make it required.";
  return (
    <li className="flex" data-testid={`gen-course-${courseCode}`}>
      {onToggle && status ? (
        <WithTooltip label={status}>
          <button
            type="button"
            aria-pressed={required === true}
            aria-label={`${courseCode}, ${required ? "required" : "optional"}`}
            onClick={onToggle}
            className={cn(chipClass, "hover:border-fg/40")}
          >
            {body}
          </button>
        </WithTooltip>
      ) : status ? (
        <WithTooltip label={status}>
          <span className={chipClass}>{body}</span>
        </WithTooltip>
      ) : (
        <span className={chipClass}>{body}</span>
      )}
      <WithTooltip label={`Remove ${courseCode}`}>
        <button
          type="button"
          aria-label={`Remove ${courseCode}`}
          onClick={onRemove}
          className={cn(
            "flex h-7 w-6 items-center justify-center rounded-r-md border border-l-0 text-faint hover:text-fg",
            required === false
              ? "border-hairline-strong border-dashed"
              : "border-hairline-strong bg-hover",
          )}
        >
          <X className="size-3" />
        </button>
      </WithTooltip>
    </li>
  );
}

/** How a wildcard chip explains itself: what it asks for, from how many. */
function wildcardStatus(
  item: GenWildcardItem,
  matches: number | null,
  termName: string,
): { text: string; missing: boolean } {
  const noun = (n: number) => wildcardNoun(item.wildcard, n);
  if (matches === 0)
    return { text: noMatchesMessage(item.wildcard, termName), missing: true };
  if (matches !== null && matches < item.count)
    return {
      text: `There ${matches === 1 ? "is" : "are"} only ${matches} ${noun(matches)} in ${termName}, fewer than the ${item.count} you asked for.`,
      missing: false,
    };
  const many = item.count === 1 ? "one" : `${item.count}`;
  const which =
    matches === 1
      ? `the one ${noun(1)}`
      : matches === null
        ? `${many} ${noun(item.count)}`
        : `${many} of ${matches} ${noun(matches)}`;
  return {
    text: item.required
      ? `Required: every plan includes ${which}. Click to make it optional.`
      : `Optional: ${which}, added when it fits. Click to make it required.`,
    missing: false,
  };
}

function WildcardChip({
  item,
  matches,
  termName,
  onToggle,
  onRemove,
}: {
  item: GenWildcardItem;
  /** Courses it can pick this term; null until the whole term has loaded. */
  matches: number | null;
  termName: string;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const label = wildcardLabel(item.wildcard);
  const status = wildcardStatus(item, matches, termName);
  const border = item.required
    ? "border-hairline-strong bg-hover"
    : "border-hairline-strong border-dashed";
  const removeLabel =
    item.count > 1
      ? `Remove one ${wildcardNoun(item.wildcard, 1)}`
      : `Remove ${label}`;
  return (
    <li
      className="flex"
      data-testid={`gen-wildcard-${wildcardId(item.wildcard)}`}
    >
      <WithTooltip label={status.text}>
        <button
          type="button"
          aria-pressed={item.required}
          aria-label={`${label}${item.count > 1 ? ` ×${item.count}` : ""}, ${item.required ? "required" : "optional"}`}
          onClick={onToggle}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-l-md border border-r-0 pr-1 pl-2 text-sm hover:border-fg/40",
            border,
            item.required ? "font-semibold" : "text-muted",
            status.missing && "text-faint line-through",
          )}
        >
          <Asterisk className="size-3 shrink-0 text-faint" aria-hidden />
          {label}
          {item.count > 1 ? (
            <span className="tnum font-normal text-muted">×{item.count}</span>
          ) : null}
        </button>
      </WithTooltip>
      <WithTooltip label={removeLabel}>
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          className={cn(
            "flex h-7 w-6 items-center justify-center rounded-r-md border border-l-0 text-faint hover:text-fg",
            border,
          )}
        >
          <X className="size-3" />
        </button>
      </WithTooltip>
    </li>
  );
}

function PickGroup({
  group,
  index,
  exclude,
  termName,
  chip,
  onChange,
}: {
  group: PickItem;
  index: CatalogIndex | undefined;
  exclude: ReadonlySet<CourseCode>;
  termName: string;
  chip: (code: CourseCode) => { color: CourseColor; missing: boolean };
  /** null removes the group. */
  onChange: (next: PickItem | null) => void;
}) {
  const max = Math.max(1, group.courses.length);
  const count = Math.min(group.count, max);
  const setCount = (n: number) =>
    onChange({ ...group, count: Math.min(Math.max(1, n), max) });
  return (
    <fieldset
      aria-label={`Pick ${count} of these`}
      className="flex flex-col gap-1.5 rounded-md border border-hairline p-2"
    >
      <div className="flex items-center gap-1 text-sm">
        <span className="text-muted">Pick</span>
        <WithTooltip label="One fewer">
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-6"
            aria-label="One fewer"
            disabled={count <= 1}
            onClick={() => setCount(count - 1)}
          >
            <Minus className="size-3" />
          </Button>
        </WithTooltip>
        <span className="tnum w-3 text-center font-semibold">{count}</span>
        <WithTooltip label="One more">
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-6"
            aria-label="One more"
            disabled={count >= max}
            onClick={() => setCount(count + 1)}
          >
            <Plus className="size-3" />
          </Button>
        </WithTooltip>
        <span className="text-muted">of these</span>
        <WithTooltip label="Remove this group">
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto size-6"
            aria-label="Remove this group"
            onClick={() => onChange(null)}
          >
            <X className="size-3.5" />
          </Button>
        </WithTooltip>
      </div>
      {group.courses.length > 0 ? (
        <ul aria-label="Courses to pick from" className="flex flex-wrap gap-1">
          {group.courses.map((c) => (
            <CourseChip
              key={c.courseCode}
              courseCode={c.courseCode}
              required={null}
              termName={termName}
              {...chip(c.courseCode)}
              onRemove={() =>
                onChange({
                  ...group,
                  courses: group.courses.filter(
                    (x) => x.courseCode !== c.courseCode,
                  ),
                })
              }
            />
          ))}
        </ul>
      ) : null}
      <CourseField
        index={index}
        exclude={exclude}
        label="Add a course to this group"
        placeholder={
          group.courses.length < 2
            ? "Add two or more courses to choose from"
            : "Add another course"
        }
        onAdd={(courseCode) =>
          onChange({ ...group, courses: [...group.courses, { courseCode }] })
        }
      />
    </fieldset>
  );
}
