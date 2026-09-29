import { Monitor, Moon, Sun } from "lucide-react";
import { type ReactNode, useSyncExternalStore } from "react";
import { type Theme, ThemeSchema } from "~/core/schema";
import { track } from "~/lib/analytics";
import {
  readThemePreference,
  setThemePreference,
  subscribeThemePreference,
} from "~/lib/theme";
import {
  ActionMenu,
  ActionMenuRadioGroup,
  ActionMenuRadioItem,
} from "~/ui/action-menu";

const OPTIONS: readonly { theme: Theme; label: string; icon: typeof Sun }[] = [
  { theme: "system", label: "System", icon: Monitor },
  { theme: "light", label: "Light", icon: Sun },
  { theme: "dark", label: "Dark", icon: Moon },
];

/**
 * A small icon in the bar, only where there's no account menu to hold the
 * theme (sign-in off, or /api/me still loading). `children` go at the end of
 * its menu, a sheet on phones.
 */
export function ThemeToggle({
  side,
  children,
}: {
  side: "right" | "bottom";
  children?: ReactNode;
}) {
  const theme = useThemePreference();
  const current = OPTIONS.find((o) => o.theme === theme) ?? OPTIONS[0];
  const Icon = current?.icon ?? Monitor;
  return (
    <ActionMenu
      title="Theme"
      tooltip={`Theme: ${current?.label ?? "System"}`}
      align={side === "right" ? "start" : "end"}
      className="min-w-[150px]"
      trigger={
        <button
          type="button"
          aria-label="Theme"
          className="flex size-8 items-center max-[380px]:size-7 justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg data-popup-open:bg-hover data-popup-open:text-fg"
        >
          <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
        </button>
      }
    >
      <ThemeMenuItems />
      {children}
    </ActionMenu>
  );
}

/**
 * The theme choices, for any action menu. With sign-in on they live in the
 * account menu instead of their own button, so the top bar keeps its room.
 */
export function ThemeMenuItems() {
  const theme = useThemePreference();
  return (
    <ActionMenuRadioGroup
      label="Theme"
      value={theme}
      onValueChange={(value) => {
        const parsed = ThemeSchema.safeParse(value);
        if (!parsed.success) return;
        setThemePreference(parsed.data);
        track("theme_changed", { theme: parsed.data });
      }}
    >
      {OPTIONS.map(({ theme: t, label, icon: OptionIcon }) => (
        <ActionMenuRadioItem
          key={t}
          value={t}
          icon={<OptionIcon className="text-muted" aria-hidden="true" />}
        >
          {label}
        </ActionMenuRadioItem>
      ))}
    </ActionMenuRadioGroup>
  );
}

/** The theme picked on any page (its saved copy is the truth, theme.ts). */
function useThemePreference() {
  return useSyncExternalStore(
    subscribeThemePreference,
    readThemePreference,
    () => "system" as const,
  );
}
