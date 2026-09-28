import { Menu } from "@base-ui/react/menu";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import { CheckIcon } from "lucide-react";
import {
  type ComponentProps,
  type ComponentType,
  createContext,
  type KeyboardEvent,
  lazy,
  type ReactElement,
  type ReactNode,
  type Ref,
  Suspense,
  useContext,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Sheet as SheetComponent } from "./sheet";
import { quietTooltips, WithTooltip } from "./tooltip";

// One menu, two shapes (docs/COHESION.md): from `md` up it's a Base UI Menu
// under its trigger; below, on phones, the same items fill a sheet from the
// bottom edge, headed by the menu's title, the way iOS shows an action sheet.
// Callers write it once:
//
//   <ActionMenu title="Plans" tooltip="Switch plans" trigger={<Button>…}>
//     <ActionMenuRadioGroup value={plan} onValueChange={setPlan}>
//       <ActionMenuRadioItem value="a" hint="5 courses · 16 credits">Plan A</…>
//     </ActionMenuRadioGroup>
//     <ActionMenuSeparator />
//     <ActionMenuItem icon={<Plus />} onSelect={newPlan}>New plan</…>
//   </ActionMenu>
//
// The desktop menu keeps Ink's look (a raised card, a hairline, the soft gray
// highlight) with the Base UI docs' pop: 100ms, scale 0.98 and a fade. The
// phone's sheet is ./sheet.tsx, loaded only on phones.

/** Below `md` (768px), where the family bar becomes the phone's bars. */
const PHONE_QUERY = "(max-width: 767.98px)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(PHONE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** Whether menus are sheets here. The kit reads the width itself (it imports only core). */
function usePhoneMenus(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

// The drawer stays out of every desktop page's first load: a phone mounting
// a menu loads it then, before the first tap.
const LazySheet = lazy<ComponentType<ComponentProps<typeof SheetComponent>>>(
  () => import("./sheet").then((m) => ({ default: m.Sheet })),
);

type Shape = { kind: "menu" } | { kind: "sheet"; close: () => void };

const ShapeContext = createContext<Shape>({ kind: "menu" });
const RadioContext = createContext<{
  value: string;
  onValueChange: (value: string) => void;
} | null>(null);

function ActionMenu({
  trigger,
  tooltip,
  shortcut,
  title,
  description,
  align = "start",
  open: controlledOpen,
  onOpenChange,
  className,
  children,
}: {
  /** The button that opens it, as an element: `<Button>Plan A</Button>`. */
  trigger: ReactElement;
  /** The trigger's tooltip (every control has one). */
  tooltip: ReactNode;
  shortcut?: string;
  /** Names the menu, and heads the sheet on phones. */
  title: string;
  /** A muted line under the sheet's title ("Spring 2027"). */
  description?: ReactNode;
  align?: "start" | "center" | "end";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Classes for the desktop menu's card (a width, say). */
  className?: string;
  children: ReactNode;
}) {
  const phone = usePhoneMenus();
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };
  const triggerRef = useRef<HTMLElement>(null);
  const headingId = useId();
  const list = useRef<HTMLDivElement>(null);

  if (!phone)
    return (
      <Menu.Root
        open={open}
        onOpenChange={(next) => setOpen(next)}
        // Not modal, as the kit's menus have been: a modal menu hides the
        // page from assistive tech while leaving it focusable.
        modal={false}
      >
        <WithTooltip label={tooltip} shortcut={shortcut}>
          <Menu.Trigger render={trigger} />
        </WithTooltip>
        <Menu.Portal>
          <Menu.Positioner
            className="z-50 outline-none"
            side="bottom"
            align={align}
            sideOffset={6}
            // Keeps it off the screen's edge.
            collisionPadding={8}
          >
            <Menu.Popup
              // Named by its title, as the phone's sheet is, not by the
              // trigger's words (a plan's name, an avatar).
              aria-labelledby={headingId}
              data-slot="action-menu"
              // A menu handing focus back to its trigger shouldn't pop the
              // trigger's tooltip over what was just picked.
              finalFocus={() => {
                quietTooltips();
                return true;
              }}
              className={cn(
                "min-w-[180px] overflow-y-auto overflow-x-hidden border border-keyline bg-raised p-1 text-fg shadow-pop outline-none",
                "max-h-(--available-height) origin-(--transform-origin)",
                "transition-[scale,opacity] duration-100 ease-out",
                "data-starting-style:scale-98 data-starting-style:opacity-0 data-ending-style:scale-98 data-ending-style:opacity-0",
                "motion-reduce:transition-opacity! motion-reduce:duration-100!",
                "motion-reduce:data-starting-style:scale-100 motion-reduce:data-ending-style:scale-100",
                className,
              )}
            >
              <span id={headingId} hidden>
                {title}
              </span>
              {children}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    );

  const shape: Shape = { kind: "sheet", close: () => setOpen(false) };
  return (
    <>
      <WithTooltip label={tooltip} shortcut={shortcut}>
        <SheetTrigger
          render={trigger}
          ref={triggerRef}
          open={open}
          onOpen={() => setOpen(true)}
        />
      </WithTooltip>
      <Suspense fallback={null}>
        <LazySheet
          open={open}
          onOpenChange={setOpen}
          aria-labelledby={headingId}
          data-slot="action-sheet"
          // Focus starts on the chosen item (or the first), and goes back to
          // the trigger, which a finger's tap didn't focus.
          initialFocus={() =>
            list.current?.querySelector<HTMLElement>(
              '[aria-checked="true"], [role^="menuitem"]:not([aria-disabled="true"])',
            ) ?? true
          }
          finalFocus={() => {
            quietTooltips();
            return triggerRef.current ?? true;
          }}
        >
          <div className="shrink-0 px-4 pt-1.5 pb-2">
            <p id={headingId} className="font-semibold text-base">
              {title}
            </p>
            {description ? (
              <p className="text-muted text-sm">{description}</p>
            ) : null}
          </div>
          <div
            ref={list}
            role="menu"
            aria-labelledby={headingId}
            onKeyDown={moveFocus}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2"
          >
            <ShapeContext.Provider value={shape}>
              {children}
            </ShapeContext.Provider>
          </div>
        </LazySheet>
      </Suspense>
    </>
  );
}

/** Arrow keys, Home and End move between a sheet's items, as in a menu. */
function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
  const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
  if (!keys.includes(event.key)) return;
  const items = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(
      '[role^="menuitem"]:not([aria-disabled="true"])',
    ),
  ];
  if (items.length === 0) return;
  event.preventDefault();
  const at = items.indexOf(document.activeElement as HTMLElement);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowDown"
          ? (at + 1) % items.length
          : (at - 1 + items.length) % items.length;
  items[next]?.focus();
}

/** The caller's trigger, opening the phone's sheet. */
function SheetTrigger({
  render,
  ref,
  open,
  onOpen,
  ...props
}: {
  render: ReactElement;
  ref: Ref<HTMLElement>;
  open: boolean;
  onOpen: () => void;
}) {
  return useRender({
    render,
    ref,
    props: mergeProps<"button">(props, {
      "aria-haspopup": "dialog",
      "aria-expanded": open,
      onClick: onOpen,
    }),
    state: { popupOpen: open },
    stateAttributesMapping: {
      popupOpen: (on) => (on ? { "data-popup-open": "" } : null),
    },
  });
}

// ── Items ─────────────────────────────────────────────────────────────────

const menuItemClass =
  "relative flex min-h-8 w-full cursor-default select-none items-center gap-2 px-2 py-1 text-left text-base outline-none data-disabled:pointer-events-none data-highlighted:bg-hover data-disabled:opacity-40 [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:pointer-events-none [&_svg]:shrink-0";

// The phone's rows: 44px targets, the soft gray under a finger, the chosen
// one in accent-soft with its check (the mockups' plans sheet).
const sheetItemClass =
  "relative flex min-h-11 w-full select-none items-center gap-2.5 px-4 py-2 text-left text-base outline-none active:bg-hover focus-visible:bg-hover aria-disabled:opacity-40 [-webkit-tap-highlight-color:transparent] [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0";

/** The label, with an optional muted line under it. */
function ItemText({ label, hint }: { label: ReactNode; hint?: ReactNode }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate">{label}</span>
      {hint ? (
        <span className="block truncate text-muted text-sm">{hint}</span>
      ) : null}
    </span>
  );
}

function Shortcut({ keys }: { keys?: string }) {
  if (!keys) return null;
  return (
    <span className="ml-auto pl-3 font-mono text-faint text-xs">{keys}</span>
  );
}

function Check({ className }: { className?: string }) {
  return <CheckIcon aria-hidden="true" className={cn("size-3.5", className)} />;
}

type ItemProps = {
  children: ReactNode;
  /** A muted line under the label ("5 courses · 16 credits"). */
  hint?: ReactNode;
  icon?: ReactNode;
  /** Shown in the desktop menu; phones have no keyboard. */
  shortcut?: string;
  disabled?: boolean;
  /** Red words for an action that removes something (Undo follows it). */
  variant?: "default" | "destructive";
};

/** An action. The menu closes as it runs. */
function ActionMenuItem({
  children,
  hint,
  icon,
  shortcut,
  disabled,
  variant = "default",
  onSelect,
}: ItemProps & { onSelect?: () => void }) {
  const shape = useContext(ShapeContext);
  const tone = variant === "destructive" && "text-error";
  if (shape.kind === "menu")
    return (
      <Menu.Item
        disabled={disabled}
        onClick={() => onSelect?.()}
        data-variant={variant}
        className={cn(menuItemClass, tone)}
      >
        {/* haptic: wire HapticTap once v3/kit-controls-haptics lands (not on destructive items) */}
        {icon}
        <ItemText label={children} hint={hint} />
        <Shortcut keys={shortcut} />
      </Menu.Item>
    );
  return (
    <button
      type="button"
      role="menuitem"
      aria-disabled={disabled || undefined}
      data-variant={variant}
      onClick={() => {
        if (disabled) return;
        onSelect?.();
        shape.close();
      }}
      className={cn(sheetItemClass, tone)}
    >
      {/* haptic: wire HapticTap once v3/kit-controls-haptics lands (not on destructive items) */}
      {icon}
      <ItemText label={children} hint={hint} />
    </button>
  );
}

/**
 * A link: another page, or a product. `render` swaps in the router's
 * `<Link>`; `current` marks the page you're on.
 */
function ActionMenuLinkItem({
  children,
  hint,
  icon,
  shortcut,
  href,
  render,
  current,
}: Omit<ItemProps, "disabled" | "variant"> & {
  href?: string;
  render?: ReactElement;
  current?: boolean;
}) {
  const shape = useContext(ShapeContext);
  const content = (
    <>
      {/* haptic: wire HapticTap once v3/kit-controls-haptics lands */}
      {icon}
      <ItemText label={children} hint={hint} />
      {current ? (
        <Check className={cn(shape.kind === "sheet" && "size-4")} />
      ) : null}
      {shape.kind === "menu" && !current ? <Shortcut keys={shortcut} /> : null}
    </>
  );
  if (shape.kind === "menu")
    return (
      <Menu.LinkItem
        href={href}
        render={render}
        aria-current={current ? "page" : undefined}
        className={menuItemClass}
      >
        {content}
      </Menu.LinkItem>
    );
  return (
    <SheetLink
      href={href}
      render={render}
      current={current}
      onPick={shape.close}
    >
      {content}
    </SheetLink>
  );
}

function SheetLink({
  href,
  render,
  current,
  onPick,
  children,
}: {
  href?: string;
  render?: ReactElement;
  current?: boolean;
  onPick: () => void;
  children: ReactNode;
}) {
  return useRender({
    defaultTagName: "a",
    render,
    props: mergeProps<"a">(
      {
        role: "menuitem",
        href,
        "aria-current": current ? "page" : undefined,
        onClick: onPick,
        className: cn(sheetItemClass, current && "bg-accent-soft"),
      },
      { children },
    ),
  });
}

/** A pick-one set (a term, a plan, a sort). Picking closes the menu. */
function ActionMenuRadioGroup({
  value,
  onValueChange,
  label,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  /** A small heading over the set. */
  label?: string;
  children: ReactNode;
}) {
  const shape = useContext(ShapeContext);
  const labelId = useId();
  if (shape.kind === "menu")
    return (
      <Menu.RadioGroup
        value={value}
        onValueChange={(next: string) => onValueChange(next)}
        aria-labelledby={label ? labelId : undefined}
      >
        {label ? <GroupLabel id={labelId}>{label}</GroupLabel> : null}
        {children}
      </Menu.RadioGroup>
    );
  return (
    <fieldset className="min-w-0" aria-labelledby={label ? labelId : undefined}>
      {label ? <GroupLabel id={labelId}>{label}</GroupLabel> : null}
      <RadioContext.Provider value={{ value, onValueChange }}>
        {children}
      </RadioContext.Provider>
    </fieldset>
  );
}

function ActionMenuRadioItem({
  value,
  children,
  hint,
  icon,
  disabled,
}: Omit<ItemProps, "shortcut" | "variant"> & { value: string }) {
  const shape = useContext(ShapeContext);
  const radio = useContext(RadioContext);
  if (shape.kind === "menu")
    return (
      <Menu.RadioItem
        value={value}
        disabled={disabled}
        closeOnClick
        className={cn(menuItemClass, "pr-7")}
      >
        {/* haptic: wire HapticTap once v3/kit-controls-haptics lands */}
        {icon}
        <ItemText label={children} hint={hint} />
        <span className="pointer-events-none absolute right-2 flex size-3.5 items-center justify-center">
          <Menu.RadioItemIndicator>
            <Check />
          </Menu.RadioItemIndicator>
        </span>
      </Menu.RadioItem>
    );
  const checked = radio?.value === value;
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (disabled) return;
        radio?.onValueChange(value);
        shape.close();
      }}
      className={cn(sheetItemClass, checked && "bg-accent-soft")}
    >
      {/* haptic: wire HapticTap once v3/kit-controls-haptics lands */}
      {icon}
      <ItemText label={children} hint={hint} />
      {checked ? <Check className="size-4" /> : null}
    </button>
  );
}

/** A setting that turns on and off. The menu stays open between taps. */
function ActionMenuCheckboxItem({
  checked,
  onCheckedChange,
  children,
  hint,
  icon,
  shortcut,
  disabled,
}: Omit<ItemProps, "variant"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const shape = useContext(ShapeContext);
  if (shape.kind === "menu")
    return (
      <Menu.CheckboxItem
        checked={checked}
        onCheckedChange={(next: boolean) => onCheckedChange(next)}
        disabled={disabled}
        className={cn(menuItemClass, "pr-7")}
      >
        {/* haptic: wire HapticTap once v3/kit-controls-haptics lands */}
        {icon}
        <ItemText label={children} hint={hint} />
        <Shortcut keys={shortcut} />
        <span className="pointer-events-none absolute right-2 flex size-3.5 items-center justify-center">
          <Menu.CheckboxItemIndicator>
            <Check />
          </Menu.CheckboxItemIndicator>
        </span>
      </Menu.CheckboxItem>
    );
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onCheckedChange(!checked);
      }}
      className={sheetItemClass}
    >
      {/* haptic: wire HapticTap once v3/kit-controls-haptics lands */}
      {icon}
      <ItemText label={children} hint={hint} />
      {checked ? <Check className="size-4" /> : null}
    </button>
  );
}

/** Items that belong together, under a small heading. */
function ActionMenuGroup({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  const shape = useContext(ShapeContext);
  const labelId = useId();
  if (shape.kind === "menu")
    return (
      <Menu.Group aria-labelledby={label ? labelId : undefined}>
        {label ? <GroupLabel id={labelId}>{label}</GroupLabel> : null}
        {children}
      </Menu.Group>
    );
  return (
    <fieldset className="min-w-0" aria-labelledby={label ? labelId : undefined}>
      {label ? <GroupLabel id={labelId}>{label}</GroupLabel> : null}
      {children}
    </fieldset>
  );
}

function GroupLabel({ id, children }: { id: string; children: ReactNode }) {
  const shape = useContext(ShapeContext);
  if (shape.kind === "menu")
    return (
      <Menu.GroupLabel
        id={id}
        className="px-2 pt-1.5 pb-1 font-medium text-muted text-xs"
      >
        {children}
      </Menu.GroupLabel>
    );
  return (
    <div id={id} className="px-4 pt-2 pb-1 font-medium text-muted text-xs">
      {children}
    </div>
  );
}

function ActionMenuSeparator() {
  const shape = useContext(ShapeContext);
  if (shape.kind === "menu")
    return <Menu.Separator className="-mx-1 my-1 h-px bg-hairline" />;
  return <hr className="my-1 h-px border-0 bg-hairline" />;
}

export {
  ActionMenu,
  ActionMenuCheckboxItem,
  ActionMenuGroup,
  ActionMenuItem,
  ActionMenuLinkItem,
  ActionMenuRadioGroup,
  ActionMenuRadioItem,
  ActionMenuSeparator,
};
