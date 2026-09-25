import {
  ArrowRightLeft,
  CircleAlert,
  LayoutList,
  type LucideIcon,
  Search,
  Share,
  Square,
  Workflow,
} from "lucide-react";

export type TabId =
  | "courses"
  | "search"
  | "problems"
  | "travel"
  | "blocks"
  | "generate"
  | "export";

export interface Tab {
  id: TabId;
  label: string;
  icon: LucideIcon;
  /** SPEC.md §3.13: `1`–`7` switch tabs. */
  shortcut: string;
}

// Rail order from SPEC.md §2.
export const TABS: readonly Tab[] = [
  { id: "courses", label: "Courses", icon: LayoutList, shortcut: "1" },
  { id: "search", label: "Search", icon: Search, shortcut: "2" },
  { id: "problems", label: "Problems", icon: CircleAlert, shortcut: "3" },
  { id: "travel", label: "Travel", icon: ArrowRightLeft, shortcut: "4" },
  { id: "blocks", label: "Blocks", icon: Square, shortcut: "5" },
  { id: "generate", label: "Generate", icon: Workflow, shortcut: "6" },
  { id: "export", label: "Export", icon: Share, shortcut: "7" },
];
