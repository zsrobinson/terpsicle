import { z } from "zod";

export const courseSchema = z.object({
  course_id: z.string(),
  semester: z.string(),
  name: z.string(),
  dept_id: z.string(),
  department: z.string(),
  credits: z.string().transform((x) => parseInt(x)),
  description: z.string(),
  grading_method: z.string().array(),
  gen_ed: z.string().array().array(),
  core: z.string().array(),
  relationships: z.object({
    coreqs: z.string().nullable(),
    prereqs: z.string().nullable(),
    formerly: z.string().nullable(),
    restrictions: z.string().nullable(),
    additional_info: z.string().nullable(),
    also_offered_as: z.string().nullable(),
    credit_granted_for: z.string().nullable(),
  }),
  sections: z.array(z.string()),
});

export const meetingSchema = z.object({
  days: z.string(),
  room: z.string(),
  building: z.string(),
  classtype: z.string(),
  start_time: z.string().transform(parseTime),
  end_time: z.string().transform(parseTime),
});

export const sectionSchema = z.object({
  course: z.string(),
  section_id: z.string(),
  semester: z.string(),
  number: z.string(),
  seats: z.string(),
  meetings: z.array(meetingSchema),
  open_seats: z.string(),
  waitlist: z.string(),
  instructors: z.array(z.string()),
});

export type IOCourse = z.infer<typeof courseSchema>;
export type IOSection = z.infer<typeof sectionSchema>;
export type IOMeeting = z.infer<typeof meetingSchema>;

export type Schedule = { term: string; name: string };
export type AddedSection = {
  id: string;
  term: string;
  scheduleName: string;
  cachedCourse: IOCourse;
  cachedSection: IOSection;
};

/** converts 10:00am or 12:30pm into the number of minutes in the day */
function parseTime(str: string): number | undefined {
  if (!str) return undefined;

  const match = str.match(/^(\d{1,2}):(\d{2})(am|pm)$/i);
  if (!match) throw new Error(`Invalid time format: ${str}`);

  const [, hours, minutes, period] = match;
  let hour = parseInt(hours, 10);
  const minute = parseInt(minutes, 10);

  if (period.toLowerCase() === "pm" && hour !== 12) {
    hour += 12;
  } else if (period.toLowerCase() === "am" && hour === 12) {
    hour = 0;
  }

  return hour * 60 + minute;
}
