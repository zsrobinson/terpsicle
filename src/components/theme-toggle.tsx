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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/ui/dropdown-menu";
import { WithTooltip } from "~/ui/tooltip";

const OPTIONS: readonly { theme: Theme; label: string; icon: typeof Sun }[] = [
  { theme: "system", label: "System", icon: Monitor },
  { theme: "light", label: "Light", icon: Sun },
  { theme: "dark", label: "Dark", icon: Moon },
];

/**
 * A small icon in the bar, only where there's no account menu to hold the
 * theme (sign-in off, or /api/me still loading). `children` go at the end of
 * its menu.
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
    <DropdownMenu>
      <WithTooltip label={`Theme: ${current?.label ?? "System"}`} side={side}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Theme"
            className="flex size-8 items-center max-[380px]:size-7 justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg"
          >
            <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
      </WithTooltip>
      <DropdownMenuContent side={side} align="end" className="min-w-[150px]">
        <ThemeMenuItems />
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The theme choices, for any dropdown menu. On phones with sign-in on, they
 * live in the account menu instead of their own button, so the top bar
 * keeps room for the plan's name.
 */
export function ThemeMenuItems() {
  const theme = useThemePreference();
  return (
    <>
      <DropdownMenuLabel>Theme</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={theme}
        onValueChange={(value) => {
          const parsed = ThemeSchema.safeParse(value);
          if (!parsed.success) return;
          setThemePreference(parsed.data);
          track("theme_changed", { theme: parsed.data });
        }}
      >
        {OPTIONS.map(({ theme: t, label, icon: OptionIcon }) => (
          <DropdownMenuRadioItem key={t} value={t}>
            <OptionIcon className="text-muted" aria-hidden="true" />
            {label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
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
