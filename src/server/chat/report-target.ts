// What reports/create needs from Chat (docs/MODERATION.md §6). Messages live
// in their course's CourseChat object, not D1, so the lookup and the take-down
// go to the object named in the report's ref (`<termId>:<courseCode>:<id>`).
import { courseRoomId } from "~/core/schema";
import type { ReportTarget } from "../moderation/reports";
import type { CourseChatNamespace } from "./course-chat";
import { parseChatTargetId } from "./moderation-handler";

export function chatReportTarget(namespace: CourseChatNamespace): ReportTarget {
  const objectFor = (ref: string) => {
    const target = parseChatTargetId(ref);
    if (!target) return null;
    const stub = namespace.get(
      namespace.idFromName(courseRoomId(target.termId, target.courseCode)),
    );
    return { target, stub };
  };
  return {
    async find(_db, ref, reporterId) {
      const found = objectFor(ref);
      if (!found) return null;
      const item = await found.stub.reportTarget({
        ...found.target,
        reporterId,
      });
      return item ? { ...item, course: found.target.courseCode } : null;
    },
    // Chat keeps no report counts of its own: `reports` rows are the count.
    counted: async () => {},
    async hide(_db, ref) {
      const found = objectFor(ref);
      return found ? found.stub.hideReported(found.target) : false;
    },
  };
}
