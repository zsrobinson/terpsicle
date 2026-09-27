// Feedback for agents (docs/FEEDBACK.md, "How agents read it"), straight
// from D1 and R2 through wrangler, with the owner's Cloudflare login:
//
//   pnpm tsx scripts/feedback.ts list [--since 7d] [--status new]
//       [--kind bug|idea|review] [--pr <n>] [--json]
//   pnpm tsx scripts/feedback.ts get <id> [--out <dir>] [--preview]
//   pnpm tsx scripts/feedback.ts get <id> --mark <status> [--preview]
//
// `--pr <n>` reads the previews' database (terpsicle-preview), where the
// owner's pinned notes on PR previews land, and keeps that PR's items;
// `--preview` does the same for `get`. `get` prints the item as Markdown;
// with `--out` it also writes it and its screenshots into that directory,
// and nowhere else. Never commit what it writes: feedback holds people's
// words. `--mark` sets the status directly and emails no one (the inbox's
// Fixed does that).
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { agentMarkdown } from "~/core/feedback/agent";
import {
  FeedbackIdSchema,
  type FeedbackKind,
  FeedbackKindSchema,
  type FeedbackStatus,
  FeedbackStatusSchema,
} from "~/core/schema/feedback";
import { type FeedbackRow, toItem } from "~/server/feedback/item";
import { isMain, ROOT } from "./lib/source-files";

const ORIGIN = "https://terpsicle.com";

export type Command =
  | {
      command: "list";
      sinceDays: number | null;
      status: FeedbackStatus | null;
      kind: FeedbackKind | null;
      pr: number | null;
      json: boolean;
    }
  | {
      command: "get";
      id: string;
      out: string | null;
      mark: FeedbackStatus | null;
      preview: boolean;
    };

export const USAGE = `Usage:
  pnpm tsx scripts/feedback.ts list [--since 7d] [--status new] [--kind bug|idea|review] [--pr <n>] [--json]
  pnpm tsx scripts/feedback.ts get <id> [--out <dir>] [--preview]
  pnpm tsx scripts/feedback.ts get <id> --mark <new|planned|fixed|wont-fix|spam> [--preview]`;

/** "7d", "12h" or "30" (days) as days; null when it isn't one. */
export function parseSince(text: string): number | null {
  const match = text.match(/^(\d{1,4})([dh]?)$/);
  if (!match) return null;
  const n = Number(match[1]);
  const days = match[2] === "h" ? n / 24 : n;
  return days > 0 ? days : null;
}

/** The command line as a command, or what's wrong with it. */
export function parseArgs(
  argv: readonly string[],
): Command | { error: string } {
  const [command, ...rest] = argv;
  const flags = new Map<string, string | true>();
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i] ?? "";
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (name === "json" || name === "preview") {
      flags.set(name, true);
      continue;
    }
    const value = rest[i + 1];
    if (value === undefined || value.startsWith("--"))
      return { error: `--${name} needs a value.` };
    flags.set(name, value);
    i++;
  }
  const text = (name: string) => {
    const v = flags.get(name);
    return typeof v === "string" ? v : null;
  };
  const allowed = (names: string[]) => {
    const extra = [...flags.keys()].find((k) => !names.includes(k));
    return extra ? `Unknown option --${extra}.` : null;
  };

  if (command === "list") {
    const unknown = allowed(["since", "status", "kind", "pr", "json"]);
    if (unknown) return { error: unknown };
    if (positional.length > 0)
      return { error: `Unexpected "${positional[0]}".` };
    const since = text("since");
    const sinceDays = since === null ? null : parseSince(since);
    if (since !== null && sinceDays === null)
      return {
        error: `--since takes a number of days or hours, like 7d or 12h.`,
      };
    const status = text("status");
    const parsedStatus =
      status === null ? null : FeedbackStatusSchema.safeParse(status);
    if (parsedStatus && !parsedStatus.success)
      return {
        error: `--status is one of ${FeedbackStatusSchema.options.join(", ")}.`,
      };
    const kind = text("kind");
    const parsedKind =
      kind === null ? null : FeedbackKindSchema.safeParse(kind);
    if (parsedKind && !parsedKind.success)
      return { error: "--kind is bug, idea or review." };
    const pr = text("pr");
    if (pr !== null && !/^[1-9]\d{0,5}$/.test(pr))
      return { error: "--pr takes a PR number." };
    return {
      command: "list",
      sinceDays,
      status: parsedStatus?.data ?? null,
      kind: parsedKind?.data ?? null,
      pr: pr === null ? null : Number(pr),
      json: flags.get("json") === true,
    };
  }

  if (command === "get") {
    const unknown = allowed(["out", "mark", "preview"]);
    if (unknown) return { error: unknown };
    const [id, ...extra] = positional;
    if (!id || !FeedbackIdSchema.safeParse(id).success)
      return { error: "get needs an item's 22-character id." };
    if (extra.length > 0) return { error: `Unexpected "${extra[0]}".` };
    const mark = text("mark");
    const parsedMark =
      mark === null ? null : FeedbackStatusSchema.safeParse(mark);
    if (parsedMark && !parsedMark.success)
      return {
        error: `--mark is one of ${FeedbackStatusSchema.options.join(", ")}.`,
      };
    return {
      command: "get",
      id,
      out: text("out"),
      mark: parsedMark?.data ?? null,
      preview: flags.get("preview") === true,
    };
  }

  return {
    error: command ? `Unknown command "${command}".` : "Which command?",
  };
}

/** A SQL string literal. Every value is checked first; this is the backstop. */
const sql = (value: string) => `'${value.replace(/'/g, "''")}'`;

/** The SELECT for `list`, newest first, with the flags as filters. */
export function listSql(
  command: Extract<Command, { command: "list" }>,
  now: Date,
): string {
  const where = ["deleted_at IS NULL"];
  if (command.sinceDays !== null)
    where.push(
      `created_at >= ${sql(new Date(now.getTime() - command.sinceDays * 86_400_000).toISOString())}`,
    );
  if (command.status) where.push(`status = ${sql(command.status)}`);
  if (command.kind) where.push(`kind = ${sql(command.kind)}`);
  if (command.pr !== null) where.push(`host LIKE ${sql(`pr-${command.pr}-%`)}`);
  return `SELECT id, kind, product, status, path, host, created_at, substr(text, 1, 80) AS text FROM feedback WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT 200`;
}

interface Target {
  database: string;
  config: string;
  bucket: string;
}

const PRODUCTION: Target = {
  database: "terpsicle",
  config: "wrangler.jsonc",
  bucket: "terpsicle-user-content",
};
const PREVIEWS: Target = {
  database: "terpsicle-preview",
  config: "wrangler.preview-d1.jsonc",
  bucket: "terpsicle-user-content-preview",
};

function d1<T>(target: Target, command: string): T[] {
  const out = execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      target.database,
      "--remote",
      "--json",
      "--config",
      target.config,
      "--command",
      command,
    ],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  const parsed = JSON.parse(out) as { results?: T[] }[];
  return parsed[0]?.results ?? [];
}

function r2Get(target: Target, key: string, file: string): void {
  execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "r2",
      "object",
      "get",
      `${target.bucket}/${key}`,
      "--remote",
      "--file",
      file,
    ],
    { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] },
  );
}

type ListRow = Pick<
  FeedbackRow,
  "id" | "kind" | "product" | "status" | "path" | "host" | "created_at" | "text"
>;

function list(command: Extract<Command, { command: "list" }>): void {
  const target = command.pr === null ? PRODUCTION : PREVIEWS;
  const rows = d1<ListRow>(target, listSql(command, new Date()));
  if (command.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (rows.length === 0) console.log("No feedback matches.");
  for (const r of rows)
    console.log(
      `${r.id}  ${r.created_at.slice(0, 16)}  ${r.status.padEnd(8)} ${r.kind.padEnd(6)} ${r.product.padEnd(8)} ${r.path}\n    ${r.text.replace(/\s+/g, " ")}`,
    );
}

function get(command: Extract<Command, { command: "get" }>): void {
  const target = command.preview ? PREVIEWS : PRODUCTION;
  if (command.mark) {
    const closing = ["fixed", "wont-fix", "spam"].includes(command.mark);
    const at = new Date().toISOString();
    d1(
      target,
      `UPDATE feedback SET status = ${sql(command.mark)}, updated_at = ${sql(at)}, closed_at = ${
        closing ? `COALESCE(closed_at, ${sql(at)})` : "NULL"
      } WHERE id = ${sql(command.id)} AND deleted_at IS NULL`,
    );
    console.log(`Marked ${command.id} ${command.mark}.`);
    return;
  }
  const [row] = d1<FeedbackRow>(
    target,
    `SELECT * FROM feedback WHERE id = ${sql(command.id)} AND deleted_at IS NULL`,
  );
  if (!row) {
    console.error("No such feedback (deleted, or past its year).");
    process.exitCode = 1;
    return;
  }
  const item = toItem(row);
  const origin = command.preview ? `https://${row.host}` : ORIGIN;
  const shot = (which: "" | "/element", has: boolean) =>
    has ? `${origin}/admin/feedback/shot/${item.id}${which}` : null;
  const markdown = agentMarkdown(item, {
    admin: `${origin}/admin/feedback?item=${item.id}`,
    screenshot: shot("", item.hasScreenshot),
    elementShot: shot("/element", item.hasElementShot),
  });
  if (!command.out) {
    process.stdout.write(markdown);
    return;
  }
  const dir = path.resolve(command.out);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${item.id}.md`), markdown);
  const files = [`${item.id}.md`];
  for (const [key, name] of [
    [row.screenshot_key, "screenshot"],
    [row.element_shot_key, "element"],
  ] as const) {
    if (!key) continue;
    const file = `${item.id}-${name}${path.extname(key)}`;
    r2Get(target, key, path.join(dir, file));
    files.push(file);
  }
  console.log(`Wrote ${files.join(", ")} to ${dir}`);
}

if (isMain(import.meta.url)) {
  const parsed = parseArgs(process.argv.slice(2));
  if ("error" in parsed) {
    console.error(`${parsed.error}\n\n${USAGE}`);
    process.exitCode = 2;
  } else if (parsed.command === "list") list(parsed);
  else get(parsed);
}
