import { Monitor, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { type Theme, ThemeSchema } from "~/core/schema";
import { useUi } from "~/state/ui-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/ui/dropdown-menu";
import { WithTooltip } from "~/ui/tooltip";
import { setTheme } from "./actions";

const OPTIONS: readonly { theme: Theme; label: string; icon: typeof Sun }[] = [
  { theme: "system", label: "System", icon: Monitor },
  { theme: "light", label: "Light", icon: Sun },
  { theme: "dark", label: "Dark", icon: Moon },
];

/**
 * A small icon at the foot of the rail (in the top bar on phones): set once,
 * rarely touched, so it stays out of the way of the plan. `children` go at
 * the end of its menu (on phones, "Install app").
 */
export function ThemeToggle({
  side,
  children,
}: {
  side: "right" | "bottom";
  children?: ReactNode;
}) {
  const theme = useUi((s) => s.theme);
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
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            const parsed = ThemeSchema.safeParse(value);
            if (parsed.success) setTheme(parsed.data);
          }}
        >
          {OPTIONS.map(({ theme: t, label, icon: OptionIcon }) => (
            <DropdownMenuRadioItem key={t} value={t}>
              <OptionIcon className="text-muted" aria-hidden="true" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
