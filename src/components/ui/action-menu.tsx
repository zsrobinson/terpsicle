import { ContextMenu } from "@base-ui/react/context-menu";
import { Menu } from "@base-ui/react/menu";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import { CheckIcon, ChevronLeft, ChevronRight } from "lucide-react";
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
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { HapticTap } from "./haptic";
import {
  MENU_ITEM,
  MENU_POPUP,
  MENU_SEPARATOR,
  POPUP_LAYER,
  POSITIONER,
} from "./popup";
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
// A row's right-click menu is the same items in `ActionContextMenu`: a
// context menu at the pointer on a desktop, and on a phone a long press
// opens the same sheet. Feature code builds every menu from these two
// (./menus.test.ts holds it to that), so no menu on a phone is a small
// desktop dropdown.
//
// The desktop menu is the kit's DropdownMenu card and rows (./popup.ts):
// Ink's look (a raised card, a hairline, the soft gray highlight) with the
// Base UI docs' pop (--dur-pop: 100ms, scale 0.98 and a fade). The phone's
// sheet is ./sheet.tsx, loaded only on phones.

/** Below `md` (768px), where the family bar becomes the phone's bars. */
const PHONE_QUERY = "(max-width: 767.98px)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(PHONE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/**
 * Whether menus are sheets here: below `md`, where the phone's tab bar is.
 * The kit reads the width itself (it imports only core).
 */
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

type Shape =
  | { kind: "menu" }
  | {
      kind: "sheet";
      /** The sheet's title: a group label that only repeats it isn't drawn. */
      title: string;
      close: () => void;
      /** The submenu showing in the list's place, if one is. */
      sub: string | null;
      openSub: (id: string | null) => void;
      /** Where a submenu's items go while it shows. */
      pane: HTMLElement | null;
    };

const ShapeContext = createContext<Shape>({ kind: "menu" });
const RadioContext = createContext<{
  value: string;
  onValueChange: (value: string) => void;
} | null>(null);

function ActionMenu({
  trigger,
  tooltip,
  tooltipCard,
  shortcut,
  title,
  description,
  align = "start",
  open: controlledOpen,
  onOpenChange,
  finalFocus,
  className,
  children,
}: {
  /** The button that opens it, as an element: `<Button>Plan A</Button>`. */
  trigger: ReactElement;
  /** The trigger's tooltip (every control has one). */
  tooltip: ReactNode;
  /** More for the tooltip to show: `WithTooltip`'s `card`. */
  tooltipCard?: ReactNode;
  shortcut?: string;
  /** Names the menu, and heads the sheet on phones. */
  title: string;
  /** A muted line under the sheet's title ("Spring 2027"). */
  description?: ReactNode;
  align?: "start" | "center" | "end";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Where focus goes as it closes, when not back to the trigger: a field an
   * item just put in the trigger's place (a rename), or `false` to leave it
   * where an item sent it.
   */
  finalFocus?: () => HTMLElement | false | null;
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

  if (!phone)
    return (
      <Menu.Root
        open={open}
        onOpenChange={(next) => setOpen(next)}
        // Not modal, as the kit's menus have been: a modal menu hides the
        // page from assistive tech while leaving it focusable.
        modal={false}
      >
        <WithTooltip label={tooltip} shortcut={shortcut} card={tooltipCard}>
          <Menu.Trigger render={trigger} />
        </WithTooltip>
        <Menu.Portal>
          <Menu.Positioner
            // A floating layer, reached from its trigger (e2e/axe.ts),
            // placed as every kit popup is.
            {...POSITIONER}
            className={POPUP_LAYER}
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
                return finalFocus?.() ?? !focusMovedOn();
              }}
              className={cn(MENU_POPUP, className)}
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

  return (
    <>
      <WithTooltip label={tooltip} shortcut={shortcut} card={tooltipCard}>
        <SheetTrigger
          render={trigger}
          ref={triggerRef}
          open={open}
          onOpen={() => setOpen(true)}
        />
      </WithTooltip>
      <MenuSheet
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        // Back to the trigger, which a finger's tap didn't focus.
        finalFocus={() => {
          quietTooltips();
          return (
            finalFocus?.() ??
            (focusMovedOn() ? false : stillHere(triggerRef.current))
          );
        }}
      >
        {children}
      </MenuSheet>
    </>
  );
}

/**
 * Whether focus went on to something else while the menu closed (a field an
 * item opened, a tab double-clicked as the menu faded): it stays there, as it
 * did on Radix, rather than going back to the trigger. Base UI asks once the
 * closing animation ends.
 */
function focusMovedOn(): boolean {
  const active = document.activeElement;
  return (
    active instanceof HTMLElement &&
    active !== document.body &&
    !active.closest(
      '[data-slot="action-menu"], [data-slot="action-submenu"], [data-slot="action-sheet"]',
    )
  );
}

/**
 * Where a sheet hands focus back: `el` while it's on the page, or nowhere.
 * Never Base UI's fallback, the last thing focused that's still here: after
 * a Delete took the trigger's row away, that was the Undo toast's button,
 * which holds the toast open while it has focus.
 */
function stillHere(el: HTMLElement | null): HTMLElement | false {
  return el?.isConnected ? el : false;
}

/**
 * A menu's phone shape: its items in a sheet, headed by its title. A
 * submenu's items take the list's place, under a row that goes back.
 */
function MenuSheet({
  open,
  onOpenChange,
  title,
  description,
  finalFocus,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  finalFocus: () => HTMLElement | boolean | null;
  children: ReactNode;
}) {
  const headingId = useId();
  const list = useRef<HTMLDivElement>(null);
  const [pane, setPane] = useState<HTMLDivElement | null>(null);
  const [sub, setSub] = useState<string | null>(null);
  // Every opening starts on the menu's own list.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSub(null);
  }
  const shape: Shape = {
    kind: "sheet",
    title,
    close: () => onOpenChange(false),
    sub,
    openSub: setSub,
    pane,
  };
  const listClass = "min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2";
  return (
    <Suspense fallback={null}>
      <LazySheet
        open={open}
        onOpenChange={onOpenChange}
        aria-labelledby={headingId}
        data-slot="action-sheet"
        // Focus starts on the chosen item (or the first).
        initialFocus={() =>
          list.current?.querySelector<HTMLElement>(
            '[aria-checked="true"], [role^="menuitem"]:not([aria-disabled="true"])',
          ) ?? true
        }
        finalFocus={finalFocus}
      >
        <div className="shrink-0 px-4 pt-1.5 pb-2">
          <p id={headingId} className="emph-heading text-base">
            {title}
          </p>
          {description ? (
            <p className="emph-secondary text-sm">{description}</p>
          ) : null}
        </div>
        <div
          ref={list}
          role="menu"
          aria-labelledby={headingId}
          hidden={sub !== null}
          onKeyDown={moveFocus}
          className={listClass}
        >
          <ShapeContext.Provider value={shape}>
            {children}
          </ShapeContext.Provider>
        </div>
        <div
          ref={setPane}
          role="menu"
          aria-labelledby={headingId}
          hidden={sub === null}
          onKeyDown={moveFocus}
          className={listClass}
        />
      </LazySheet>
    </Suspense>
  );
}

/**
 * A row's menu: a right click on it opens it at the pointer; on a phone a
 * long press opens the same items as a sheet headed by `title`, as an
 * iPhone's long-press menu does. The row is `target`; the children are the
 * `ActionMenu…` items an `ActionMenu` takes.
 */
function ActionContextMenu({
  target,
  title,
  description,
  className,
  children,
}: {
  /** What a right click or a long press lands on: the row, the card. */
  target: ReactElement;
  /** Names the menu, and heads the sheet on phones: the row's own name. */
  title: string;
  description?: ReactNode;
  /** Classes for the desktop menu's card. */
  className?: string;
  children: ReactNode;
}) {
  const phone = usePhoneMenus();
  const [open, setOpen] = useState(false);
  const headingId = useId();
  // Typed as Base UI types its trigger (a div, unless `target` is another).
  const row = useRef<HTMLDivElement>(null);
  const backToPage = () => {
    quietTooltips();
    return !focusMovedOn();
  };
  return (
    <>
      <ContextMenu.Root
        // On a phone Base UI only spots the long press (or Android's
        // context menu): its menu stays shut and the sheet opens.
        open={open && !phone}
        onOpenChange={(next) => setOpen(next)}
      >
        <ContextMenu.Trigger
          ref={row}
          render={target}
          // The row keeps its highlight while its menu is open (the
          // `menu-open` variant in styles.css), on a phone's sheet too.
          // Base UI's data-popup-open can't say it: a row that's also a
          // tooltip's trigger gets that from its tooltip.
          data-menu-open={open ? "" : undefined}
        />
        {phone ? null : (
          <ContextMenu.Portal>
            <ContextMenu.Positioner
              {...POSITIONER}
              className={POPUP_LAYER}
              // Its top-left corner just right of the pointer.
              side="right"
              align="start"
              sideOffset={2}
              collisionPadding={8}
            >
              <ContextMenu.Popup
                aria-labelledby={headingId}
                data-slot="action-menu"
                finalFocus={backToPage}
                className={cn(MENU_POPUP, className)}
              >
                <span id={headingId} hidden>
                  {title}
                </span>
                {children}
              </ContextMenu.Popup>
            </ContextMenu.Positioner>
          </ContextMenu.Portal>
        )}
      </ContextMenu.Root>
      {phone ? (
        <MenuSheet
          open={open}
          onOpenChange={setOpen}
          title={title}
          description={description}
          finalFocus={() => {
            quietTooltips();
            return focusMovedOn() ? false : stillHere(row.current);
          }}
        >
          {children}
        </MenuSheet>
      ) : null}
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

// The desktop menu's rows are the kit's menu rows.
const menuItemClass = MENU_ITEM;

// The phone's rows: 44px targets, the soft gray under a finger, the chosen
// one in accent-soft with its check (the mockups' plans sheet).
const sheetItemClass =
  "relative flex min-h-11 w-full select-none items-center gap-3 px-4 py-2 text-left text-base outline-none active:bg-hover focus-visible:bg-hover aria-disabled:opacity-40 [-webkit-tap-highlight-color:transparent] [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0";

/** The label, with an optional muted line under it. */
function ItemText({
  label,
  hint,
  note,
}: {
  label: ReactNode;
  hint?: ReactNode;
  /**
   * A sheet's line for an item's tooltip: it describes the item (the
   * caller's `aria-describedby`) rather than naming it, as the tooltip did.
   */
  note?: { id: string; text: string };
}) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate">{label}</span>
      {hint ? (
        // Two lines at most, where a menu's width runs out.
        <span className="line-clamp-2 text-pretty text-muted text-sm">
          {hint}
        </span>
      ) : null}
      {note ? (
        <span
          id={note.id}
          aria-hidden="true"
          className="block text-muted text-sm leading-snug"
        >
          {note.text}
        </span>
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
  /**
   * More about an item whose label doesn't say enough ("Your plans stay on
   * this device"): its tooltip in the menu (side left), and in the sheet,
   * where nothing hovers, its muted line.
   */
  tooltip?: string;
  icon?: ReactNode;
  /** Shown in the desktop menu; phones have no keyboard. */
  shortcut?: string;
  disabled?: boolean;
  /** Red words for an action that removes something (Undo follows it). */
  variant?: "default" | "destructive";
};

/** An action. The menu closes as it runs, unless it's `keepOpen`. */
function ActionMenuItem({
  children,
  hint,
  tooltip,
  icon,
  shortcut,
  disabled,
  variant = "default",
  keepOpen = false,
  onSelect,
}: ItemProps & {
  onSelect?: () => void;
  /** Stays open after it runs, to say how it went (a sign-out that failed). */
  keepOpen?: boolean;
}) {
  const shape = useContext(ShapeContext);
  const noteId = useId();
  const tone = variant === "destructive" && "text-error";
  if (shape.kind === "menu")
    return (
      <ItemTooltip label={tooltip}>
        <Menu.Item
          disabled={disabled}
          closeOnClick={!keepOpen}
          onClick={() => onSelect?.()}
          data-variant={variant}
          className={cn(menuItemClass, tone)}
        >
          {icon}
          <ItemText label={children} hint={hint} />
          <Shortcut keys={shortcut} />
          {/* A choice ticks; a destructive one stays silent (its Undo ticks). */}
          {variant === "destructive" ? null : <HapticTap />}
        </Menu.Item>
      </ItemTooltip>
    );
  return (
    <button
      type="button"
      role="menuitem"
      aria-disabled={disabled || undefined}
      aria-describedby={tooltip ? noteId : undefined}
      data-variant={variant}
      onClick={() => {
        if (disabled) return;
        onSelect?.();
        if (!keepOpen) shape.close();
      }}
      className={cn(sheetItemClass, tone)}
    >
      {icon}
      <ItemText
        label={children}
        hint={hint}
        note={tooltip ? { id: noteId, text: tooltip } : undefined}
      />
      {variant === "destructive" ? null : <HapticTap />}
    </button>
  );
}

/** An item's tooltip in the desktop menu (docs/decisions.md, "Tooltips on controls, not on menu options"). */
function ItemTooltip({
  label,
  children,
}: {
  label: string | undefined;
  children: ReactElement;
}) {
  if (!label) return children;
  return (
    <WithTooltip label={label} side="left">
      {children}
    </WithTooltip>
  );
}

/**
 * A link: another page, or a product. `render` swaps in the router's
 * `<Link>`; `current` marks the page you're on.
 */
function ActionMenuLinkItem({
  children,
  hint,
  tooltip,
  icon,
  shortcut,
  href,
  render,
  current,
  currentClassName,
}: Omit<ItemProps, "disabled" | "variant"> & {
  href?: string;
  render?: ReactElement;
  current?: boolean;
  /** The current page's fill in place of the kit's accent-soft (a product's soft color). */
  currentClassName?: string;
}) {
  const shape = useContext(ShapeContext);
  const noteId = useId();
  const note =
    shape.kind === "sheet" && tooltip ? { id: noteId, text: tooltip } : null;
  const content = (
    <>
      {icon}
      <ItemText label={children} hint={hint} note={note ?? undefined} />
      {current ? (
        <Check className={cn(shape.kind === "sheet" && "size-4")} />
      ) : null}
      {shape.kind === "menu" && !current ? <Shortcut keys={shortcut} /> : null}
      <HapticTap />
    </>
  );
  if (shape.kind === "menu")
    return (
      <ItemTooltip label={tooltip}>
        <Menu.LinkItem
          href={href}
          render={render}
          // As the sheet does: following a link (a new tab, say) is a pick.
          closeOnClick
          aria-current={current ? "page" : undefined}
          className={cn(menuItemClass, current && currentClassName)}
        >
          {content}
        </Menu.LinkItem>
      </ItemTooltip>
    );
  return (
    <SheetLink
      href={href}
      render={render}
      current={current}
      currentClassName={currentClassName}
      describedBy={note?.id}
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
  currentClassName = "bg-accent-soft",
  describedBy,
  onPick,
  children,
}: {
  href?: string;
  render?: ReactElement;
  current?: boolean;
  currentClassName?: string;
  describedBy?: string;
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
        "aria-describedby": describedBy,
        onClick: onPick,
        className: cn(sheetItemClass, current && currentClassName),
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
        {icon}
        <ItemText label={children} hint={hint} />
        <span className="pointer-events-none absolute right-2 flex size-3.5 items-center justify-center">
          <Menu.RadioItemIndicator>
            <Check />
          </Menu.RadioItemIndicator>
        </span>
        <HapticTap />
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
      {icon}
      <ItemText label={children} hint={hint} />
      {checked ? <Check className="size-4" /> : null}
      <HapticTap />
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
        {icon}
        <ItemText label={children} hint={hint} />
        <Shortcut keys={shortcut} />
        <span className="pointer-events-none absolute right-2 flex size-3.5 items-center justify-center">
          <Menu.CheckboxItemIndicator>
            <Check />
          </Menu.CheckboxItemIndicator>
        </span>
        <HapticTap />
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
      {icon}
      <ItemText label={children} hint={hint} />
      {checked ? <Check className="size-4" /> : null}
      <HapticTap />
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
        className="emph-heading px-2 pt-1.5 pb-1 text-xs"
      >
        {children}
      </Menu.GroupLabel>
    );
  return (
    <div
      id={id}
      className={cn(
        "emph-heading px-4 pt-2 pb-1 text-xs",
        // Under a sheet title that already says it, it only names the group.
        children === shape.title && "sr-only",
      )}
    >
      {children}
    </div>
  );
}

/**
 * Items behind one item ("Move to…", "Credits"): a submenu beside it on a
 * desktop; on a phone they take the sheet's list's place, under a row that
 * goes back.
 */
function ActionMenuSub({
  label,
  hint,
  icon,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  /** Classes for the desktop submenu's card (a width, say). */
  className?: string;
  children: ReactNode;
}) {
  const shape = useContext(ShapeContext);
  const id = useId();
  const row = useRef<HTMLButtonElement>(null);
  const showing = shape.kind === "sheet" && shape.sub === id;
  // Focus follows the finger's place: into the submenu's chosen item (or its
  // first), then back to its row.
  const pane = shape.kind === "sheet" ? shape.pane : null;
  const goingBack = useRef(false);
  useEffect(() => {
    if (showing && pane) {
      const items = [
        ...pane.querySelectorAll<HTMLElement>(
          '[role^="menuitem"]:not([aria-disabled="true"])',
        ),
      ];
      // Past the row that goes back.
      const first =
        items.find((el) => el.getAttribute("aria-checked") === "true") ??
        items[1] ??
        items[0];
      first?.focus();
    } else if (!showing && goingBack.current) {
      goingBack.current = false;
      row.current?.focus();
    }
  }, [showing, pane]);

  if (shape.kind === "menu")
    return (
      <Menu.SubmenuRoot>
        <Menu.SubmenuTrigger
          className={cn(menuItemClass, "data-popup-open:bg-hover")}
        >
          {icon}
          <ItemText label={label} hint={hint} />
          <ChevronRight aria-hidden="true" className="ml-auto text-muted" />
        </Menu.SubmenuTrigger>
        <Menu.Portal>
          <Menu.Positioner
            {...POSITIONER}
            className={POPUP_LAYER}
            collisionPadding={8}
          >
            <Menu.Popup
              data-slot="action-submenu"
              className={cn(MENU_POPUP, className)}
            >
              {children}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.SubmenuRoot>
    );
  const back = () => {
    goingBack.current = true;
    shape.openSub(null);
  };
  return (
    <>
      <button
        ref={row}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={showing}
        onClick={() => shape.openSub(id)}
        // The keys a desktop submenu answers to: right goes in, left out.
        onKeyDown={(event) => {
          if (event.key !== "ArrowRight") return;
          event.preventDefault();
          shape.openSub(id);
        }}
        className={sheetItemClass}
      >
        {icon}
        <ItemText label={label} hint={hint} />
        <ChevronRight aria-hidden="true" className="text-muted" />
        <HapticTap />
      </button>
      {showing && shape.pane
        ? createPortal(
            <fieldset
              className="contents"
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft") return;
                event.preventDefault();
                back();
              }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={back}
                className={cn(sheetItemClass, "font-medium")}
              >
                <ChevronLeft aria-hidden="true" className="text-muted" />
                <span className="min-w-0 flex-1 truncate">
                  {label}
                  <span className="sr-only">, back</span>
                </span>
                <HapticTap />
              </button>
              <ActionMenuSeparator />
              {children}
            </fieldset>,
            shape.pane,
          )
        : null}
    </>
  );
}

/**
 * Words in the menu that aren't an item (who's signed in, a note), padded
 * as the items are in either shape.
 */
function ActionMenuText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const shape = useContext(ShapeContext);
  return (
    <div
      className={cn(
        "text-muted text-sm",
        shape.kind === "menu" ? "px-2 py-1.5" : "px-4 py-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

function ActionMenuSeparator() {
  const shape = useContext(ShapeContext);
  if (shape.kind === "menu")
    return <Menu.Separator className={MENU_SEPARATOR} />;
  return <hr className="my-1 h-px border-0 bg-hairline" />;
}

export {
  ActionContextMenu,
  ActionMenu,
  ActionMenuCheckboxItem,
  ActionMenuGroup,
  ActionMenuItem,
  ActionMenuLinkItem,
  ActionMenuRadioGroup,
  ActionMenuRadioItem,
  ActionMenuSeparator,
  ActionMenuSub,
  ActionMenuText,
  usePhoneMenus,
};
