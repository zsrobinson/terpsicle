import { z } from "zod";
import { FourYearDocSchema } from "./four-year";
import { PlanSchema } from "./local";
import { NotificationSettingsSchema } from "./notifications";
import {
  CourseCodeSchema,
  DirectoryIdSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  SectionKeySchema,
  TermIdSchema,
} from "./primitives";
import { MyReviewSchema } from "./reviews";
import { SettingsDocSchema } from "./sync";
import { TodoDueTimeSchema, TodoTaskUidSchema } from "./todo-api";

// The data file (docs/DATA.md §5.6): everything a person owns in Terpsicle, as
// one JSON file they download from Settings ("Your data") and can add back
// later, here or on another account. Never anyone else's data: another
// person's chat messages, a review's author, or ELMS's deadlines (Todo
// fetches those again from the feed).
//
// Out of the barrel, like the four-year doc it carries: it loads only when
// someone downloads or adds a file.
//
// `version` goes up with any change an older build couldn't read. A build
// reads every version up to its own and says a newer file needs a reload.

export const DATA_EXPORT_FORMAT = "terpsicle-data";
export const DATA_EXPORT_VERSION = 1;
/** A file bigger than this isn't read (plans and four-year plans are small). */
export const DATA_EXPORT_MAX_BYTES = 10 * 1024 * 1024;

/** One of your own Todo tasks, as you'd type it again. */
export const ExportTaskSchema = z.object({
  uid: TodoTaskUidSchema,
  title: z.string().min(1).max(300),
  courseCode: CourseCodeSchema.nullable(),
  /** Null: "No date". */
  dueDate: IsoDateSchema.nullable(),
  /** Minutes after midnight in New York; null is all day (or no date). */
  dueTime: TodoDueTimeSchema.nullable(),
  done: z.boolean(),
});
export type ExportTask = z.infer<typeof ExportTaskSchema>;

/** A message you wrote in a class chat, with where it is. */
export const ExportChatMessageSchema = z.object({
  termId: TermIdSchema,
  courseCode: CourseCodeSchema,
  roomId: z.string(),
  id: z.string(),
  body: z.string(),
  /** The message it answers, by id only: never someone else's words. */
  replyTo: z.string().nullable(),
  /** "held" and "removed" are moderation's; "checking" is on its way. */
  status: z.enum(["checking", "visible", "held", "removed"]),
  createdAt: IsoDateTimeSchema,
  editedAt: IsoDateTimeSchema.nullable(),
});
export type ExportChatMessage = z.infer<typeof ExportChatMessageSchema>;

/**
 * What only the account holds, from `POST /api/account/export`: who you
 * are, Todo's own tasks, seat watches, notification settings, your class
 * chats and your messages in them, and your reviews.
 */
export const AccountDataSchema = z.object({
  profile: z.object({
    id: DirectoryIdSchema,
    name: z.string(),
    email: z.string(),
    createdAt: IsoDateTimeSchema,
  }),
  /** Null when Todo isn't on for you. */
  todo: z
    .object({
      tasks: z.array(ExportTaskSchema),
      /** Courses you hid in Todo. */
      hiddenCourses: z.array(z.string()),
    })
    .nullable(),
  seatWatches: z.array(
    z.object({
      termId: TermIdSchema,
      sectionKey: SectionKeySchema,
      createdAt: IsoDateTimeSchema,
    }),
  ),
  notificationSettings: NotificationSettingsSchema,
  chat: z.object({
    /** Your course rooms, from your main plans ("" sectionCode: saved for later). */
    rooms: z.array(
      z.object({
        termId: TermIdSchema,
        courseCode: CourseCodeSchema,
        sectionCode: z.string(),
      }),
    ),
    /** Course chats you opened from outside your plan. */
    follows: z.array(
      z.object({
        termId: TermIdSchema,
        courseCode: CourseCodeSchema,
        createdAt: IsoDateTimeSchema,
      }),
    ),
    muted: z.array(
      z.object({
        termId: TermIdSchema,
        courseCode: CourseCodeSchema,
        roomId: z.string(),
      }),
    ),
    messages: z.array(ExportChatMessageSchema),
  }),
  reviews: z.array(MyReviewSchema),
});
export type AccountData = z.infer<typeof AccountDataSchema>;

export const AccountExportInputSchema = z.strictObject({});

/** The data file. */
export const DataExportSchema = z.object({
  format: z.literal(DATA_EXPORT_FORMAT),
  version: z.literal(DATA_EXPORT_VERSION),
  exportedAt: IsoDateTimeSchema,
  /**
   * `account`: signed in, everything on the account (and what this browser
   * hadn't saved to it yet). `browser`: signed out, this browser's plans.
   */
  from: z.enum(["account", "browser"]),
  /** The scheduler's plans, every term. */
  plans: z.array(PlanSchema),
  /** Blocks, course colors, travel, main plans and the other products' prefs. */
  settings: SettingsDocSchema,
  /** Terpsicle Plan's four-year plans, grades included. */
  fourYear: z.array(FourYearDocSchema),
  /** Null in a browser's file. */
  account: AccountDataSchema.nullable(),
});
export type DataExport = z.infer<typeof DataExportSchema>;
