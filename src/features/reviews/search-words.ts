import type { Ref } from "react";

// What Reviews' search box and its stand-in share (./search.tsx), so the
// box that loads later reads the same as the one the server drew.

export type SearchVariant = "page" | "bar" | "sheet";

export interface SearchBoxProps {
  variant: SearchVariant;
  initialQuery?: string;
  placeholder?: string;
  inputRef?: Ref<HTMLInputElement>;
  /** After a result is picked (the sheet closes). */
  onPicked?: () => void;
  /** The stand-in had focus: take it over. */
  autoFocus?: boolean;
}

export const SEARCH_LABEL = "Search instructors and courses";

/** The words in the empty box: phones get the question alone, since the example was cut off there. */
export function searchPlaceholder(
  variant: SearchVariant,
  phone: boolean,
): string {
  if (variant === "page" && !phone)
    return "Search instructors and courses: Kruskal, CMSC351…";
  if (variant === "bar") return "Search reviews";
  return "Search instructors and courses";
}

/** The box's tooltip where it has one (a sheet's box is the sheet's point). */
export const SEARCH_TIP: Record<SearchVariant, string | null> = {
  page: "Search by an instructor's name, or a course's code, title or department",
  bar: "Search instructors and courses",
  sheet: null,
};
