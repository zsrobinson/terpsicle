import {
  type Connection,
  type ConnectionVerdict,
  type Message,
  PACE_MPH,
  TIGHT_SHARE,
  type TravelMode,
  type TravelSettings,
} from "../schema";
import { feetPerMinute } from "./walk";

// Words and numbers for connection details and the "How?" link (SPEC §3.7).

export const VERDICT_WORDS = {
  ok: "Plenty of time",
  tight: "Tight",
  insufficient: "Not enough time",
  unknown: "No route data yet",
} as const satisfies Record<ConnectionVerdict, string>;

/**
 * "Not enough time: 18 min to get there, 10 min between classes. You'd be
 * about 8 min late." Durations are parts so the UI sets them in mono.
 */
export function verdictMessage(connection: Connection): Message {
  const { verdict, walkMinutes: walk, gapMinutes: gap } = connection;
  if (verdict === "unknown" || walk === null)
    return [{ kind: "text", text: `${VERDICT_WORDS.unknown}.` }];
  const parts: Message = [
    { kind: "text", text: `${VERDICT_WORDS[verdict]}: ` },
    { kind: "duration", minutes: walk },
    { kind: "text", text: " to get there, " },
    { kind: "duration", minutes: gap },
    { kind: "text", text: " between classes." },
  ];
  if (verdict === "insufficient")
    parts.push(
      { kind: "text", text: " You'd be about " },
      { kind: "duration", minutes: walk - gap },
      { kind: "text", text: " late." },
    );
  return parts;
}

/** Every number in the estimate, for "How?" and connection details. */
export type TravelMath = {
  readonly mode: TravelMode;
  readonly distanceFeet: number;
  readonly mph: number;
  /** mph × 88. */
  readonly feetPerMinute: number;
  /** distance ÷ feet per minute, before rounding up. */
  readonly exactMinutes: number;
  /** Rounded up to whole minutes. */
  readonly walkingMinutes: number;
  readonly extraMinutes: number;
  /** walkingMinutes + extraMinutes: the number the verdict uses. */
  readonly totalMinutes: number;
  readonly gapMinutes: number;
  /** The walk is tight from this many minutes on (75% of the gap). */
  readonly tightFromMinutes: number;
  readonly verdict: ConnectionVerdict;
};

/** null when the connection has no distance yet. */
export function travelMath(
  connection: Connection,
  settings: TravelSettings,
): TravelMath | null {
  if (connection.distanceFeet === null || connection.walkMinutes === null)
    return null;
  const fpm = feetPerMinute(settings);
  const exact = connection.distanceFeet / fpm;
  return {
    mode: connection.mode,
    distanceFeet: connection.distanceFeet,
    mph: PACE_MPH[settings.pace],
    feetPerMinute: fpm,
    exactMinutes: exact,
    walkingMinutes: Math.ceil(exact),
    extraMinutes: settings.extraMinutes,
    totalMinutes: connection.walkMinutes,
    gapMinutes: connection.gapMinutes,
    tightFromMinutes: TIGHT_SHARE * connection.gapMinutes,
    verdict: connection.verdict,
  };
}

const EXPLAIN_PREFERENCE: readonly ConnectionVerdict[] = [
  "insufficient",
  "tight",
  "ok",
];

/**
 * The one real connection "How?" walks through: the first that isn't enough
 * time, else the first tight one, else the first with a distance.
 */
export function connectionToExplain(
  connections: readonly Connection[],
): Connection | null {
  for (const verdict of EXPLAIN_PREFERENCE) {
    const found = connections.find((c) => c.verdict === verdict);
    if (found) return found;
  }
  return null;
}
