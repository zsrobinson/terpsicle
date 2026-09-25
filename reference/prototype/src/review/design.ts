// PROTOTYPE: every open design question is one field here. The review page renders the app with
// BASE plus a single field changed, so each option is judged in context.
import { createContext, useContext } from "react";

export type Design = {
  planNav: "tabs" | "dropdown" | "panel";
  newPlan: "empty" | "copy" | "ask";
  compare: "none" | "overlay" | "split";
  firstTab: "Plan" | "Courses" | "Overview";
  rail: "labeled" | "top" | "icons";
  drillHeader: "back" | "breadcrumb" | "backNav";
  collapsible: boolean;
  blockContent: "compact" | "standard" | "detailed";
  colors: "pastel" | "solid" | "mono";
  ghosts: "dashed" | "faded" | "hoverOnly";
  pills: "all" | "problems" | "edge";
  timeRange: "fit" | "fixed";
  overlap: "columns" | "stacked";
  finals: "toggle" | "about";
  sectionLayout: "rows" | "byInstructor" | "table";
  fitMode: "words" | "sorted" | "filter";
  instructors: "cards" | "inline" | "compare";
  grades: "bars" | "stacked" | "sentence";
  seats: "text" | "meter" | "lowOnly";
  searchResults: "courses" | "expand" | "sections";
  filters: "chips" | "popover" | "inline";
  searchHover: "off" | "on";
  problems: "tab" | "banner" | "inline";
  problemGroup: "severity" | "course" | "day";
  travelSettings: "tab" | "header";
  explain: "full" | "disclosure" | "tooltip";
  legViz: "numbers" | "bars" | "map";
  blockCreate: "drag" | "form" | "both";
  generate: "tab" | "fromProblems" | "none";
  freshness: "topbar" | "details" | "none";
  alerts: "email" | "push" | "either";
  regHelper: "codes" | "checklist";
  shared: "readonly" | "newPlan" | "overlay";
  firstRun: "guide" | "search" | "sample";
  accent: "red" | "black" | "blue";
  density: "compact" | "comfortable";
  // preview-only setup knobs (not design decisions)
  _startFinals?: boolean;
  _startCompare?: boolean;
  _sharedMode?: boolean;
};

// Round 2, variant 1 as built: the baseline every option is compared against.
export const BASE: Design = {
  planNav: "tabs", newPlan: "empty", compare: "none", firstTab: "Plan", rail: "labeled", drillHeader: "back", collapsible: false,
  blockContent: "standard", colors: "pastel", ghosts: "dashed", pills: "all", timeRange: "fit", overlap: "columns", finals: "about",
  sectionLayout: "rows", fitMode: "words", instructors: "cards", grades: "bars", seats: "text",
  searchResults: "courses", filters: "chips", searchHover: "off", problems: "tab", problemGroup: "severity",
  travelSettings: "tab", explain: "full", legViz: "numbers", blockCreate: "form", generate: "none",
  freshness: "none", alerts: "email", regHelper: "codes", shared: "readonly", firstRun: "guide", accent: "red", density: "compact",
};

// Every pick from the final review (2026-09-25). This is what v2 should look like, minus the
// deltas listed in reference/prototype/README.md.
export const FINAL: Design = {
  ...BASE,
  planNav: "tabs", newPlan: "ask", compare: "none", firstTab: "Courses", rail: "labeled", drillHeader: "breadcrumb", collapsible: true,
  blockContent: "standard", colors: "pastel", ghosts: "dashed", pills: "all", timeRange: "fit", overlap: "columns", finals: "about",
  sectionLayout: "byInstructor", fitMode: "words", instructors: "cards", grades: "bars", seats: "meter",
  searchResults: "courses", filters: "inline", searchHover: "on", problems: "tab", problemGroup: "severity",
  travelSettings: "tab", explain: "disclosure", legViz: "map", blockCreate: "both", generate: "tab",
  freshness: "details", alerts: "email", regHelper: "checklist", shared: "readonly", firstRun: "guide", accent: "black", density: "compact",
};

export const DesignCtx = createContext<Design>(BASE);
export const useDesign = () => useContext(DesignCtx);
