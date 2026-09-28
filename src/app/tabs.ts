import {
  CircleAlert,
  ClipboardCheck,
  Layers,
  LayoutList,
  type LucideIcon,
  Route,
  Search,
  Square,
} from "lucide-react";
import type { RailTab } from "~/core/schema";

export interface Tab {
  id: RailTab;
  label: string;
  icon: LucideIcon;
  /** SPEC §3.13: `1`–`7` switch tabs. */
  shortcut: string;
}

// Rail order from SPEC §2; icons from the reference prototype.
export const TABS: readonly Tab[] = [
  { id: "courses", label: "Courses", icon: LayoutList, shortcut: "1" },
  { id: "search", label: "Search", icon: Search, shortcut: "2" },
  { id: "problems", label: "Problems", icon: CircleAlert, shortcut: "3" },
  { id: "travel", label: "Travel", icon: Route, shortcut: "4" },
  { id: "blocks", label: "Blocks", icon: Square, shortcut: "5" },
  { id: "generate", label: "Generate", icon: Layers, shortcut: "6" },
  // Export until 2026-09-28: sharing moved to the Share button over the
  // calendar, and what's left is registration day's checklist.
  { id: "register", label: "Register", icon: ClipboardCheck, shortcut: "7" },
];

export function tabById(id: RailTab): Tab {
  const tab = TABS.find((t) => t.id === id);
  if (!tab) throw new Error(`Unknown tab ${id}`);
  return tab;
}
