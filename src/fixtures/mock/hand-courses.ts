// Courses the recon didn't capture (their departments' pages weren't saved),
// taken from the prototype (reference/prototype/src/data.ts): real UMD codes,
// titles, gen-eds and buildings, with invented instructors. The sections are
// arranged so the demo plans show the states the UI must handle; see plans.ts.
import type { Course, Section, TimedMeeting } from "~/core/schema";
import {
  aCourse,
  anUntimedMeeting,
  aSection,
  aTimedMeeting,
} from "../builders";

const lec = (
  days: TimedMeeting["days"],
  start: number,
  end: number,
  building: string,
  room: string,
): TimedMeeting => aTimedMeeting({ days, start, end, building, room });

const dis = (
  days: TimedMeeting["days"],
  start: number,
  end: number,
  building: string,
  room: string,
): TimedMeeting => ({
  ...lec(days, start, end, building, room),
  kind: "discussion",
});

const t = (h: number, m = 0) => h * 60 + m;

function sections(...list: Section[]): Section[] {
  return list;
}

const noText = {
  prerequisite: null,
  corequisite: null,
  restriction: null,
  otherNotes: [],
  crossListings: [],
  permission: null,
};

export const handCourses: Record<string, { name: string; courses: Course[] }> =
  {
    ARTH: {
      name: "Art History & Archaeology",
      courses: [
        aCourse({
          ...noText,
          code: "ARTH200",
          title: "Art and Society in Ancient and Medieval Europe",
          genEds: [[{ code: "DSHU" }], [{ code: "SCIS" }]],
          gradingMethods: ["Reg", "P-F", "Aud"],
          description:
            "Major monuments and artists of the ancient and medieval world, studied in their historical and cultural setting.",
          sections: sections(
            aSection({
              code: "0101",
              instructors: ["Helena Ferreira"],
              meetings: [lec(["Tu", "Th"], t(11), t(12, 15), "ASY", "2309")],
            }),
          ),
        }),
      ],
    },
    ECON: {
      name: "Economics",
      courses: [
        aCourse({
          ...noText,
          code: "ECON200",
          title: "Principles of Micro-Economics",
          credits: { min: 4, max: 4 },
          genEds: [[{ code: "DSSP" }]],
          gradingMethods: ["Reg", "P-F", "Aud"],
          description:
            "An introduction to the economic principles of consumer and firm behavior, markets, and the role of government.",
          // 0101–0103 differ only by discussion room: time-identical sections.
          sections: sections(
            ...(["0101", "0102", "0103"] as const).map((code, i) =>
              aSection({
                code,
                instructors: ["Daniel Novak"],
                meetings: [
                  lec(["Tu", "Th"], t(14), t(15, 15), "VMH", "1330"),
                  dis(
                    ["W"],
                    t(15),
                    t(15, 50),
                    "TYD",
                    ["0101", "0102", "1102"][i] ?? "0101",
                  ),
                ],
              }),
            ),
            aSection({
              code: "0104",
              instructors: ["Daniel Novak"],
              meetings: [
                lec(["Tu", "Th"], t(14), t(15, 15), "VMH", "1330"),
                dis(["W"], t(16), t(16, 50), "TYD", "0101"),
              ],
            }),
            aSection({
              code: "0105",
              instructors: ["Daniel Novak"],
              meetings: [
                lec(["Tu", "Th"], t(14), t(15, 15), "VMH", "1330"),
                dis(["F"], t(9), t(9, 50), "TYD", "2102"),
              ],
            }),
            aSection({
              code: "0201",
              instructors: ["Daniel Novak"],
              delivery: "blended",
              meetings: [
                lec(["M"], t(16), t(17, 15), "VMH", "1330"),
                anUntimedMeeting(),
              ],
              notes:
                "Blended learning section: half of the course meets online on ELMS.",
            }),
          ),
        }),
      ],
    },
    ENGL: {
      name: "English",
      courses: [
        aCourse({
          ...noText,
          code: "ENGL393",
          title: "Technical Writing",
          genEds: [[{ code: "FSPW" }]],
          gradingMethods: ["Reg"],
          prerequisite: "ENGL101; junior standing.",
          description:
            "The writing of technical papers and reports. Building on the skills developed in ENGL101, students learn to write effective technical documents for a range of audiences.",
          sections: sections(
            aSection({
              code: "0101",
              instructors: ["Signe Lindqvist"],
              meetings: [lec(["Tu", "Th"], t(9, 30), t(10, 45), "TWS", "1100")],
            }),
            aSection({
              code: "0205",
              instructors: ["Helena Ferreira"],
              meetings: [
                lec(["Tu", "Th"], t(15, 30), t(16, 45), "TWS", "0236"),
              ],
              notes:
                "Restricted to students in the Clark School of Engineering.",
              restriction:
                "Restricted to students in the Clark School of Engineering.",
            }),
            aSection({
              code: "0312",
              instructors: ["Maeve Brennan"],
              delivery: "online-async",
              meetings: [anUntimedMeeting()],
            }),
            aSection({
              code: "0404",
              instructors: ["Signe Lindqvist"],
              meetings: [lec(["M", "W"], t(15), t(16, 15), "TWS", "1104")],
            }),
            aSection({
              code: "FC01",
              instructors: ["Helena Ferreira", "Maeve Brennan"],
              delivery: "online-sync",
              meetings: [
                {
                  ...lec(["Tu", "Th"], t(18), t(19, 15), "TWS", "1100"),
                  building: null,
                  room: null,
                  online: true,
                },
              ],
              dates: { start: "2027-03-01", end: "2027-05-11" },
              notes:
                "Second-half-of-semester section; meets online at the listed times.",
            }),
          ),
        }),
      ],
    },
    MATH: {
      name: "Mathematics",
      courses: [
        aCourse({
          ...noText,
          code: "MATH240",
          title: "Introduction to Linear Algebra",
          credits: { min: 4, max: 4 },
          gradingMethods: ["Reg", "P-F", "Aud"],
          prerequisite: "MATH141.",
          description:
            "Basic concepts of linear algebra: vector spaces, applications to line and plane geometry, linear equations and matrices, eigenvalues and eigenvectors.",
          sections: sections(
            aSection({
              code: "0101",
              instructors: ["Kemi Adeyemi"],
              meetings: [
                lec(["M", "W", "F"], t(8), t(8, 50), "MTH", "0303"),
                dis(["Tu", "Th"], t(8), t(8, 50), "MTH", "0104"),
              ],
            }),
            aSection({
              code: "0102",
              instructors: ["Kemi Adeyemi"],
              meetings: [
                lec(["M", "W", "F"], t(8), t(8, 50), "MTH", "0303"),
                dis(["Tu", "Th"], t(9), t(9, 50), "MTH", "0104"),
              ],
            }),
          ),
        }),
      ],
    },
    MUSC: {
      name: "Music",
      courses: [
        aCourse({
          ...noText,
          code: "MUSC130",
          title: "Survey of Western Music Literature",
          genEds: [[{ code: "DSHU" }]],
          gradingMethods: ["Reg", "P-F", "Aud"],
          description:
            "Music from the Middle Ages to the present, with emphasis on listening and understanding musical styles in their cultural context.",
          sections: sections(
            aSection({
              code: "0101",
              instructors: ["Elena Castillo"],
              meetings: [lec(["Tu", "Th"], t(9, 30), t(10, 45), "PAC", "2102")],
            }),
            aSection({
              code: "0201",
              instructors: ["Elena Castillo"],
              delivery: "online-async",
              meetings: [anUntimedMeeting()],
            }),
          ),
        }),
      ],
    },
    PHIL: {
      name: "Philosophy",
      courses: [
        aCourse({
          ...noText,
          code: "PHIL140",
          title: "Contemporary Moral Issues",
          genEds: [[{ code: "DSHU" }], [{ code: "DVUP" }]],
          gradingMethods: ["Reg", "P-F", "Aud"],
          description:
            "The use of philosophical analysis to think clearly about moral issues such as abortion, euthanasia, capital punishment, and economic justice.",
          sections: sections(
            aSection({
              code: "0101",
              instructors: ["Tae Park"],
              meetings: [lec(["M", "W"], t(9, 30), t(10, 45), "SQH", "1120")],
            }),
            aSection({
              code: "0201",
              instructors: ["Tae Park"],
              meetings: [
                lec(["Tu", "Th"], t(15, 30), t(16, 45), "SQH", "1120"),
              ],
            }),
          ),
        }),
      ],
    },
    PSYC: {
      name: "Psychology",
      courses: [
        aCourse({
          ...noText,
          code: "PSYC100",
          title: "Introduction to Psychology",
          // Counts for one of these, the student's choice.
          genEds: [[{ code: "DSHS" }, { code: "DSNS" }]],
          gradingMethods: ["Reg", "P-F", "Aud"],
          description:
            "A basic introductory course, intended to bring the student into contact with the major problems confronting psychology and the more important attempts at their solution.",
          sections: sections(
            aSection({
              code: "0101",
              instructors: ["Daniel Novak"],
              meetings: [lec(["M", "W", "F"], t(10), t(10, 50), "BPS", "1101")],
            }),
            aSection({
              code: "0201",
              instructors: [],
              meetings: [lec(["Tu", "Th"], t(11), t(12, 15), "BPS", "1101")],
            }),
          ),
        }),
      ],
    },
    STAT: {
      name: "Statistics",
      courses: [
        aCourse({
          ...noText,
          code: "STAT400",
          title: "Applied Probability and Statistics I",
          gradingMethods: ["Reg", "P-F", "Aud"],
          prerequisite: "MATH141.",
          description:
            "Random variables, standard distributions, moments, law of large numbers and central limit theorem. Sampling methods, estimation of parameters, testing of hypotheses.",
          sections: sections(
            // ESJ at 10:50 to CSI at 11:00 is the demo plan's tight connection.
            aSection({
              code: "0101",
              instructors: ["Kemi Adeyemi"],
              meetings: [lec(["M", "W", "F"], t(10), t(10, 50), "ESJ", "0202")],
            }),
            aSection({
              code: "0201",
              instructors: ["Rana Haddad"],
              meetings: [lec(["M", "W", "F"], t(9), t(9, 50), "PHY", "1412")],
            }),
            aSection({
              code: "0301",
              instructors: ["Kemi Adeyemi"],
              meetings: [lec(["Tu", "Th"], t(14), t(15, 15), "ESJ", "2204")],
            }),
          ),
        }),
      ],
    },
  };
