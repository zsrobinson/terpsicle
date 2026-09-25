// PROTOTYPE mock data. Course codes, gen-eds and buildings are real UMD ones;
// instructors, ratings, reviews, seats and grade numbers are invented.

export type Day = 0 | 1 | 2 | 3 | 4;
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
export const DAY_LETTERS = ["M", "Tu", "W", "Th", "F"] as const;

export type Meeting = {
  days: Day[];
  start: number; // minutes since midnight
  end: number;
  bldg?: string;
  room?: string;
  kind: "Lec" | "Dis" | "Lab";
};

export type Section = {
  id: string;
  course: string;
  code: string;
  profs: string[];
  seats: { open: number; total: number; wait: number; hold: number };
  delivery: "f2f" | "blended" | "online-sync" | "online-async";
  meetings: Meeting[];
  note?: string;
  fillHistory?: number[]; // open seats over the last registration period
};

export type Course = {
  code: string;
  title: string;
  credits: number;
  geneds: string[];
  desc: string;
  prereq?: string;
  color: number;
  avgGpa: number;
  grades: [number, number, number, number, number]; // % A B C D F
  exam?: string;
  byProf?: Record<string, { gpa: number; aOrB: number }>;
  final?: { day: number; start: number; end: number } | "none"; // day = index into FINALS_DAYS
};

export const FINALS_DAYS = ["Tue May 11", "Wed May 12", "Thu May 13", "Fri May 14", "Sat May 15", "Mon May 17"];

export type Prof = {
  name: string;
  rating: number;
  reviews: number;
  summary: string;
  tags: { label: string; tone: "good" | "bad" | "neutral" }[];
};

export type Building = { code: string; name: string; lat: number; lng: number };

export const TERM = { id: "202701", name: "Spring 2027" };

export const BUILDINGS: Record<string, Building> = {
  IRB: { code: "IRB", name: "Iribe Center", lat: 38.9891, lng: -76.9365 },
  CSI: { code: "CSI", name: "Computer Science Instructional Center", lat: 38.9901, lng: -76.9362 },
  EGR: { code: "EGR", name: "Glenn L. Martin Hall", lat: 38.989, lng: -76.9376 },
  ESJ: { code: "ESJ", name: "Edward St. John Learning & Teaching Center", lat: 38.9869, lng: -76.9419 },
  MTH: { code: "MTH", name: "Kirwan Hall", lat: 38.9885, lng: -76.9391 },
  PHY: { code: "PHY", name: "John S. Toll Physics Building", lat: 38.9887, lng: -76.94 },
  ATL: { code: "ATL", name: "Atlantic Building", lat: 38.9906, lng: -76.9403 },
  HBK: { code: "HBK", name: "Hornbake Library", lat: 38.988, lng: -76.9415 },
  BPS: { code: "BPS", name: "Biology-Psychology Building", lat: 38.9888, lng: -76.9431 },
  JMZ: { code: "JMZ", name: "Jiménez Hall", lat: 38.9868, lng: -76.9446 },
  TYD: { code: "TYD", name: "Tydings Hall", lat: 38.9848, lng: -76.944 },
  KEY: { code: "KEY", name: "Key Hall", lat: 38.9853, lng: -76.9432 },
  SQH: { code: "SQH", name: "Susquehanna Hall", lat: 38.9823, lng: -76.9437 },
  LEF: { code: "LEF", name: "LeFrak Hall", lat: 38.9837, lng: -76.9437 },
  TWS: { code: "TWS", name: "Tawes Hall", lat: 38.9859, lng: -76.9481 },
  VMH: { code: "VMH", name: "Van Munching Hall", lat: 38.9831, lng: -76.947 },
  PAC: { code: "PAC", name: "Clarice Smith Performing Arts Center", lat: 38.9906, lng: -76.9505 },
  MMH: { code: "MMH", name: "Marie Mount Hall", lat: 38.9848, lng: -76.9408 },
  MCK: { code: "MCK", name: "McKeldin Library", lat: 38.986, lng: -76.9451 },
  ASY: { code: "ASY", name: "Art-Sociology Building", lat: 38.9855, lng: -76.9479 },
  STAMP: { code: "STAMP", name: "Stamp Student Union", lat: 38.9881, lng: -76.9448 },
};

export const PROFS: Record<string, Prof> = {
  "A. Moreno": { name: "A. Moreno", rating: 4.6, reviews: 88, summary: "Clear, well-paced lectures. Exams are hard but the curve is generous; students who go to office hours rave about it.", tags: [{ label: "clear lectures", tone: "good" }, { label: "hard exams", tone: "bad" }, { label: "generous curve", tone: "good" }] },
  "J. Whitfield": { name: "J. Whitfield", rating: 3.1, reviews: 142, summary: "Knows the material deeply but moves fast. Projects are heavy; many say the discussion TAs carry the course.", tags: [{ label: "fast pace", tone: "bad" }, { label: "heavy projects", tone: "bad" }, { label: "great TAs", tone: "good" }] },
  "P. Okafor": { name: "P. Okafor", rating: 4.2, reviews: 61, summary: "Engaging and funny. Homework is weekly and predictable, and exams mirror it closely.", tags: [{ label: "engaging", tone: "good" }, { label: "predictable exams", tone: "good" }] },
  "L. Tanaka": { name: "L. Tanaka", rating: 3.8, reviews: 35, summary: "Organized and fair. Lectures read from slides, but the notes are thorough enough to study from.", tags: [{ label: "organized", tone: "good" }, { label: "slide-heavy", tone: "neutral" }] },
  "R. Haddad": { name: "R. Haddad", rating: 2.4, reviews: 57, summary: "Frequent complaints about unclear grading and late feedback. Material is interesting.", tags: [{ label: "unclear grading", tone: "bad" }, { label: "late feedback", tone: "bad" }] },
  "S. Lindqvist": { name: "S. Lindqvist", rating: 4.8, reviews: 23, summary: "Students call it the best writing class they've taken. Lots of individual feedback on drafts.", tags: [{ label: "great feedback", tone: "good" }, { label: "light workload", tone: "good" }] },
  "M. Brennan": { name: "M. Brennan", rating: 3.5, reviews: 19, summary: "Fine but forgettable. Attendance counts toward the grade.", tags: [{ label: "attendance graded", tone: "neutral" }] },
  "K. Adeyemi": { name: "K. Adeyemi", rating: 4.4, reviews: 72, summary: "Explains intuition before formulas. Quizzes every week keep you on track.", tags: [{ label: "intuitive", tone: "good" }, { label: "weekly quizzes", tone: "neutral" }] },
  "D. Novak": { name: "D. Novak", rating: 3.9, reviews: 204, summary: "Huge lecture, well run. Recorded lectures and a very active Piazza.", tags: [{ label: "recorded", tone: "good" }, { label: "huge lecture", tone: "neutral" }] },
  "E. Castillo": { name: "E. Castillo", rating: 4.7, reviews: 41, summary: "Passionate about the subject; listening assignments are genuinely enjoyable.", tags: [{ label: "passionate", tone: "good" }, { label: "easy A", tone: "good" }] },
  "T. Park": { name: "T. Park", rating: 4.1, reviews: 30, summary: "Discussion-heavy seminar style. Participation matters a lot.", tags: [{ label: "discussion-heavy", tone: "neutral" }] },
  "H. Ferreira": { name: "H. Ferreira", rating: 3.3, reviews: 48, summary: "Tough grader on essays but gives clear rubrics.", tags: [{ label: "tough grader", tone: "bad" }, { label: "clear rubrics", tone: "good" }] },
  "N. Iyer": { name: "N. Iyer", rating: 4.5, reviews: 52, summary: "Project-based and practical. You leave with a portfolio piece.", tags: [{ label: "practical", tone: "good" }, { label: "project-based", tone: "neutral" }] },
  "V. Osei": { name: "V. Osei", rating: 4.3, reviews: 96, summary: "Patient with beginners and posts great lecture notes. Projects ramp up fast in the second half.", tags: [{ label: "beginner-friendly", tone: "good" }, { label: "projects ramp up", tone: "neutral" }] },
  "B. Kowalski": { name: "B. Kowalski", rating: 3.4, reviews: 131, summary: "Fair but strict about deadlines. Lectures are dense; the textbook helps.", tags: [{ label: "strict deadlines", tone: "bad" }, { label: "dense lectures", tone: "neutral" }] },
  "C. Duval": { name: "C. Duval", rating: 3.7, reviews: 26, summary: "Lab sections are well organized; lectures are dry.", tags: [{ label: "dry lectures", tone: "bad" }, { label: "good labs", tone: "good" }] },
};

const t = (h: number, m = 0) => h * 60 + m;
const MWF: Day[] = [0, 2, 4];
const MW: Day[] = [0, 2];
const TuTh: Day[] = [1, 3];

export const COURSES: Record<string, Course> = {
  CMSC351: { code: "CMSC351", title: "Algorithms", credits: 3, geneds: [], color: 0, avgGpa: 2.71, grades: [28, 31, 24, 8, 9], exam: "Sat May 15 · 4:00–6:00pm", final: { day: 4, start: 16 * 60, end: 18 * 60 }, byProf: { "A. Moreno": { gpa: 2.93, aOrB: 64 }, "J. Whitfield": { gpa: 2.48, aOrB: 51 } }, prereq: "Minimum grade of C- in CMSC250 and CMSC216.", desc: "A systematic study of the complexity of some elementary algorithms related to sorting, graphs and trees, and combinatorics. Algorithms are analyzed using mathematical techniques to solve recurrences and summations." },
  CMSC330: { code: "CMSC330", title: "Organization of Programming Languages", credits: 3, geneds: [], color: 1, avgGpa: 2.84, grades: [31, 30, 22, 8, 9], final: { day: 1, start: 8 * 60, end: 10 * 60 }, byProf: { "P. Okafor": { gpa: 2.91, aOrB: 63 }, "L. Tanaka": { gpa: 2.77, aOrB: 58 } }, prereq: "Minimum grade of C- in CMSC250 and CMSC216.", desc: "The semantics of programming languages and their run-time organization. Several different models of languages are discussed, including procedural, functional, and object-oriented." },
  STAT400: { code: "STAT400", title: "Applied Probability and Statistics I", credits: 3, geneds: [], color: 2, avgGpa: 2.95, grades: [33, 32, 21, 7, 7], exam: "Sat May 15 · 4:00–6:00pm", final: { day: 4, start: 16 * 60, end: 18 * 60 }, byProf: { "K. Adeyemi": { gpa: 3.12, aOrB: 70 }, "R. Haddad": { gpa: 2.66, aOrB: 54 } }, prereq: "MATH141.", desc: "Random variables, standard distributions, moments, law of large numbers and central limit theorem. Sampling methods, estimation of parameters, testing of hypotheses." },
  ENGL393: { code: "ENGL393", title: "Technical Writing", credits: 3, geneds: ["FSPW"], color: 3, avgGpa: 3.62, grades: [66, 27, 5, 1, 1], final: "none", byProf: { "S. Lindqvist": { gpa: 3.81, aOrB: 97 }, "H. Ferreira": { gpa: 3.31, aOrB: 86 }, "M. Brennan": { gpa: 3.58, aOrB: 92 } }, prereq: "ENGL101; junior standing.", desc: "The writing of technical papers and reports. Building on the skills developed in ENGL101, students learn to write effective technical documents for a range of audiences." },
  ECON200: { code: "ECON200", title: "Principles of Micro-Economics", credits: 4, geneds: ["DSSP"], color: 4, avgGpa: 2.99, grades: [30, 35, 22, 6, 7], final: { day: 2, start: 13 * 60 + 30, end: 15 * 60 + 30 }, desc: "An introduction to the economic principles of consumer and firm behavior, markets, and the role of government." },
  MUSC130: { code: "MUSC130", title: "Survey of Western Music Literature", credits: 3, geneds: ["DSHU"], color: 5, avgGpa: 3.55, grades: [61, 28, 7, 2, 2], final: { day: 0, start: 10 * 60 + 30, end: 12 * 60 + 30 }, desc: "Music from the Middle Ages to the present, with emphasis on listening and understanding musical styles in their cultural context." },
  PHIL140: { code: "PHIL140", title: "Contemporary Moral Issues", credits: 3, geneds: ["DSHU", "DVUP"], color: 6, avgGpa: 3.21, grades: [42, 36, 15, 4, 3], desc: "The use of philosophical analysis to think clearly about moral issues such as abortion, euthanasia, capital punishment, and economic justice." },
  CMSC320: { code: "CMSC320", title: "Introduction to Data Science", credits: 3, geneds: [], color: 7, avgGpa: 3.18, grades: [45, 30, 15, 5, 5], prereq: "Minimum grade of C- in CMSC216 and CMSC250.", desc: "An introduction to the data science pipeline: data collection and management, exploratory analysis, statistical modeling, and machine learning." },
  GEOG123: { code: "GEOG123", title: "Causes and Implications of Global Change", credits: 3, geneds: ["DSNS", "SCIS"], color: 2, avgGpa: 3.4, grades: [52, 31, 11, 3, 3], desc: "Physical, biological and human processes shaping global change, and their implications for society." },
  PSYC100: { code: "PSYC100", title: "Introduction to Psychology", credits: 3, geneds: ["DSHS", "DSNS"], color: 4, avgGpa: 3.1, grades: [40, 34, 17, 5, 4], desc: "A basic introductory course, intended to bring the student into contact with the major problems confronting psychology and the more important attempts at their solution." },
  ARTH200: { code: "ARTH200", title: "Art and Society in Ancient and Medieval Europe", credits: 3, geneds: ["DSHU", "SCIS"], color: 5, avgGpa: 3.33, grades: [46, 35, 13, 3, 3], desc: "Major monuments and artists of the ancient and medieval world, studied in their historical and cultural setting." },
  CMSC131: { code: "CMSC131", title: "Object-Oriented Programming I", credits: 4, geneds: [], color: 7, avgGpa: 2.88, grades: [34, 29, 19, 8, 10], final: { day: 3, start: 18 * 60 + 30, end: 20 * 60 + 30 }, byProf: { "V. Osei": { gpa: 3.05, aOrB: 67 }, "B. Kowalski": { gpa: 2.61, aOrB: 55 }, "N. Iyer": { gpa: 2.97, aOrB: 64 } }, prereq: "Minimum grade of C- in MATH115 or placement.", desc: "Introduction to programming and computer science. Emphasizes understanding and implementation of applications using object-oriented techniques." },
  MATH240: { code: "MATH240", title: "Introduction to Linear Algebra", credits: 4, geneds: [], color: 6, avgGpa: 2.62, grades: [25, 30, 26, 9, 10], prereq: "MATH141.", desc: "Basic concepts of linear algebra: vector spaces, applications to line and plane geometry, linear equations and matrices, eigenvalues and eigenvectors." },
};

const hist = (start: number, end: number) =>
  Array.from({ length: 12 }, (_, i) => Math.max(end, Math.round(start - ((start - end) * Math.pow(i / 11, 0.6)))));

export const SECTIONS: Section[] = [
  // CMSC351
  { id: "CMSC351-0101", course: "CMSC351", code: "0101", profs: ["A. Moreno"], seats: { open: 0, total: 120, wait: 14, hold: 0 }, delivery: "f2f", fillHistory: hist(120, 0), meetings: [{ days: TuTh, start: t(9, 30), end: t(10, 45), bldg: "IRB", room: "0318", kind: "Lec" }, { days: [0], start: t(9), end: t(9, 50), bldg: "CSI", room: "2117", kind: "Dis" }] },
  { id: "CMSC351-0201", course: "CMSC351", code: "0201", profs: ["J. Whitfield"], seats: { open: 11, total: 120, wait: 0, hold: 0 }, delivery: "f2f", fillHistory: hist(120, 11), meetings: [{ days: TuTh, start: t(11), end: t(12, 15), bldg: "IRB", room: "0318", kind: "Lec" }, { days: [2], start: t(10), end: t(10, 50), bldg: "CSI", room: "2118", kind: "Dis" }] },
  { id: "CMSC351-0301", course: "CMSC351", code: "0301", profs: ["A. Moreno"], seats: { open: 3, total: 90, wait: 0, hold: 0 }, delivery: "f2f", fillHistory: hist(90, 3), meetings: [{ days: MWF, start: t(13), end: t(13, 50), bldg: "IRB", room: "1116", kind: "Lec" }, { days: [1], start: t(14), end: t(14, 50), bldg: "CSI", room: "3117", kind: "Dis" }] },
  // CMSC330
  { id: "CMSC330-0101", course: "CMSC330", code: "0101", profs: ["P. Okafor"], seats: { open: 22, total: 150, wait: 0, hold: 0 }, delivery: "f2f", fillHistory: hist(150, 22), meetings: [{ days: MWF, start: t(11), end: t(11, 50), bldg: "IRB", room: "0324", kind: "Lec" }, { days: [3], start: t(8), end: t(8, 50), bldg: "CSI", room: "1115", kind: "Dis" }] },
  { id: "CMSC330-0201", course: "CMSC330", code: "0201", profs: ["P. Okafor"], seats: { open: 40, total: 150, wait: 0, hold: 0 }, delivery: "f2f", fillHistory: hist(150, 40), meetings: [{ days: MWF, start: t(14), end: t(14, 50), bldg: "IRB", room: "0324", kind: "Lec" }, { days: [3], start: t(10), end: t(10, 50), bldg: "CSI", room: "1121", kind: "Dis" }] },
  { id: "CMSC330-0301", course: "CMSC330", code: "0301", profs: ["L. Tanaka"], seats: { open: 17, total: 100, wait: 0, hold: 0 }, delivery: "f2f", fillHistory: hist(100, 17), meetings: [{ days: TuTh, start: t(15, 30), end: t(16, 45), bldg: "ESJ", room: "0202", kind: "Lec" }, { days: [4], start: t(10), end: t(10, 50), bldg: "CSI", room: "2107", kind: "Dis" }] },
  // STAT400
  { id: "STAT400-0101", course: "STAT400", code: "0101", profs: ["K. Adeyemi"], seats: { open: 6, total: 60, wait: 0, hold: 0 }, delivery: "f2f", fillHistory: hist(60, 6), meetings: [{ days: TuTh, start: t(12, 30), end: t(13, 45), bldg: "MTH", room: "0101", kind: "Lec" }] },
  { id: "STAT400-0201", course: "STAT400", code: "0201", profs: ["R. Haddad"], seats: { open: 31, total: 60, wait: 0, hold: 0 }, delivery: "f2f", fillHistory: hist(60, 31), meetings: [{ days: MWF, start: t(9), end: t(9, 50), bldg: "PHY", room: "1412", kind: "Lec" }] },
  { id: "STAT400-0301", course: "STAT400", code: "0301", profs: ["K. Adeyemi"], seats: { open: 0, total: 60, wait: 5, hold: 0 }, delivery: "f2f", fillHistory: hist(60, 0), meetings: [{ days: TuTh, start: t(14), end: t(15, 15), bldg: "ESJ", room: "2204", kind: "Lec" }] },
  // ENGL393
  { id: "ENGL393-0101", course: "ENGL393", code: "0101", profs: ["S. Lindqvist"], seats: { open: 2, total: 19, wait: 0, hold: 0 }, delivery: "f2f", fillHistory: hist(19, 2), meetings: [{ days: MW, start: t(12), end: t(13, 15), bldg: "TWS", room: "1100", kind: "Lec" }] },
  { id: "ENGL393-0205", course: "ENGL393", code: "0205", profs: ["H. Ferreira"], seats: { open: 7, total: 19, wait: 0, hold: 0 }, delivery: "f2f", note: "Restricted to students in the Clark School of Engineering.", fillHistory: hist(19, 7), meetings: [{ days: TuTh, start: t(15, 30), end: t(16, 45), bldg: "TWS", room: "0236", kind: "Lec" }] },
  { id: "ENGL393-0312", course: "ENGL393", code: "0312", profs: ["M. Brennan"], seats: { open: 9, total: 19, wait: 0, hold: 0 }, delivery: "online-async", note: "Class time/details on ELMS.", fillHistory: hist(19, 9), meetings: [] },
  { id: "ENGL393-0404", course: "ENGL393", code: "0404", profs: ["S. Lindqvist"], seats: { open: 12, total: 19, wait: 0, hold: 0 }, delivery: "f2f", fillHistory: hist(19, 12), meetings: [{ days: MW, start: t(15), end: t(16, 15), bldg: "TWS", room: "1104", kind: "Lec" }] },
  // ECON200
  { id: "ECON200-0101", course: "ECON200", code: "0101", profs: ["D. Novak"], seats: { open: 48, total: 300, wait: 0, hold: 0 }, delivery: "f2f", fillHistory: hist(300, 48), meetings: [{ days: TuTh, start: t(14), end: t(15, 15), bldg: "VMH", room: "1330", kind: "Lec" }, { days: [4], start: t(9), end: t(9, 50), bldg: "TYD", room: "0101", kind: "Dis" }] },
  { id: "ECON200-0201", course: "ECON200", code: "0201", profs: ["D. Novak"], seats: { open: 64, total: 300, wait: 0, hold: 0 }, delivery: "blended", fillHistory: hist(300, 64), meetings: [{ days: [0], start: t(16), end: t(17, 15), bldg: "VMH", room: "1330", kind: "Lec" }, { days: [2], start: t(13), end: t(13, 50), bldg: "TYD", room: "2102", kind: "Dis" }] },
  // MUSC130
  { id: "MUSC130-0101", course: "MUSC130", code: "0101", profs: ["E. Castillo"], seats: { open: 15, total: 200, wait: 0, hold: 0 }, delivery: "f2f", fillHistory: hist(200, 15), meetings: [{ days: TuTh, start: t(9, 30), end: t(10, 45), bldg: "PAC", room: "2102", kind: "Lec" }] },
  { id: "MUSC130-0201", course: "MUSC130", code: "0201", profs: ["E. Castillo"], seats: { open: 70, total: 120, wait: 0, hold: 0 }, delivery: "online-async", note: "Class time/details on ELMS.", fillHistory: hist(120, 70), meetings: [] },
  // PHIL140
  { id: "PHIL140-0101", course: "PHIL140", code: "0101", profs: ["T. Park"], seats: { open: 25, total: 90, wait: 0, hold: 0 }, delivery: "f2f", fillHistory: hist(90, 25), meetings: [{ days: MW, start: t(9, 30), end: t(10, 45), bldg: "SQH", room: "1120", kind: "Lec" }] },
  { id: "PHIL140-0201", course: "PHIL140", code: "0201", profs: ["T. Park"], seats: { open: 38, total: 90, wait: 0, hold: 0 }, delivery: "f2f", fillHistory: hist(90, 38), meetings: [{ days: TuTh, start: t(15, 30), end: t(16, 45), bldg: "SQH", room: "1120", kind: "Lec" }] },
  // CMSC320
  { id: "CMSC320-0101", course: "CMSC320", code: "0101", profs: ["N. Iyer"], seats: { open: 4, total: 80, wait: 0, hold: 0 }, delivery: "f2f", fillHistory: hist(80, 4), meetings: [{ days: MW, start: t(14), end: t(15, 15), bldg: "IRB", room: "1116", kind: "Lec" }] },
  { id: "CMSC320-0201", course: "CMSC320", code: "0201", profs: ["N. Iyer"], seats: { open: 19, total: 80, wait: 0, hold: 0 }, delivery: "f2f", fillHistory: hist(80, 19), meetings: [{ days: TuTh, start: t(8), end: t(9, 15), bldg: "IRB", room: "1116", kind: "Lec" }] },
  // GEOG123
  { id: "GEOG123-0101", course: "GEOG123", code: "0101", profs: ["C. Duval"], seats: { open: 55, total: 150, wait: 0, hold: 0 }, delivery: "f2f", fillHistory: hist(150, 55), meetings: [{ days: MW, start: t(12), end: t(12, 50), bldg: "LEF", room: "2205", kind: "Lec" }, { days: [4], start: t(12), end: t(12, 50), bldg: "LEF", room: "1222", kind: "Lab" }] },
  // PSYC100
  { id: "PSYC100-0101", course: "PSYC100", code: "0101", profs: ["D. Novak"], seats: { open: 12, total: 250, wait: 0, hold: 0 }, delivery: "f2f", fillHistory: hist(250, 12), meetings: [{ days: MWF, start: t(10), end: t(10, 50), bldg: "BPS", room: "1101", kind: "Lec" }] },
  // ARTH200
  { id: "ARTH200-0101", course: "ARTH200", code: "0101", profs: ["H. Ferreira"], seats: { open: 20, total: 60, wait: 0, hold: 0 }, delivery: "f2f", fillHistory: hist(60, 20), meetings: [{ days: TuTh, start: t(11), end: t(12, 15), bldg: "ASY", room: "2309", kind: "Lec" }] },
  // CMSC131: many sections, three instructors
  { id: "CMSC131-0101", course: "CMSC131", code: "0101", profs: ["V. Osei"], seats: { open: 0, total: 36, wait: 9, hold: 0 }, delivery: "f2f", meetings: [{ days: MWF, start: t(10), end: t(10, 50), bldg: "IRB", room: "0324", kind: "Lec" }, { days: [1, 3], start: t(9), end: t(9, 50), bldg: "CSI", room: "2107", kind: "Dis" }] },
  { id: "CMSC131-0102", course: "CMSC131", code: "0102", profs: ["V. Osei"], seats: { open: 4, total: 36, wait: 0, hold: 0 }, delivery: "f2f", meetings: [{ days: MWF, start: t(10), end: t(10, 50), bldg: "IRB", room: "0324", kind: "Lec" }, { days: [1, 3], start: t(12), end: t(12, 50), bldg: "CSI", room: "2107", kind: "Dis" }] },
  { id: "CMSC131-0103", course: "CMSC131", code: "0103", profs: ["V. Osei"], seats: { open: 12, total: 36, wait: 0, hold: 0 }, delivery: "f2f", meetings: [{ days: MWF, start: t(10), end: t(10, 50), bldg: "IRB", room: "0324", kind: "Lec" }, { days: [1, 3], start: t(15), end: t(15, 50), bldg: "CSI", room: "2118", kind: "Dis" }] },
  { id: "CMSC131-0201", course: "CMSC131", code: "0201", profs: ["B. Kowalski"], seats: { open: 20, total: 36, wait: 0, hold: 0 }, delivery: "f2f", meetings: [{ days: MWF, start: t(13), end: t(13, 50), bldg: "ESJ", room: "0224", kind: "Lec" }, { days: [1, 3], start: t(10), end: t(10, 50), bldg: "CSI", room: "1115", kind: "Dis" }] },
  { id: "CMSC131-0202", course: "CMSC131", code: "0202", profs: ["B. Kowalski"], seats: { open: 17, total: 36, wait: 0, hold: 0 }, delivery: "f2f", meetings: [{ days: MWF, start: t(13), end: t(13, 50), bldg: "ESJ", room: "0224", kind: "Lec" }, { days: [1, 3], start: t(16), end: t(16, 50), bldg: "CSI", room: "1121", kind: "Dis" }] },
  { id: "CMSC131-0301", course: "CMSC131", code: "0301", profs: ["N. Iyer"], seats: { open: 2, total: 36, wait: 0, hold: 0 }, delivery: "f2f", meetings: [{ days: [1, 3], start: t(9, 30), end: t(10, 45), bldg: "IRB", room: "1116", kind: "Lec" }, { days: [0], start: t(14), end: t(14, 50), bldg: "CSI", room: "3117", kind: "Dis" }] },
  // MATH240
  { id: "MATH240-0101", course: "MATH240", code: "0101", profs: ["K. Adeyemi"], seats: { open: 8, total: 40, wait: 0, hold: 0 }, delivery: "f2f", fillHistory: hist(40, 8), meetings: [{ days: MWF, start: t(8), end: t(8, 50), bldg: "MTH", room: "0303", kind: "Lec" }, { days: TuTh, start: t(8), end: t(8, 50), bldg: "MTH", room: "0104", kind: "Dis" }] },
];

export const SECTION_BY_ID = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));
export const sectionsOf = (course: string) => SECTIONS.filter((s) => s.course === course);

export type Block = { id: string; label: string; days: Day[]; start: number; end: number; bldg?: string };

export const DEFAULT_SCHEDULE = {
  sections: ["CMSC351-0201", "CMSC330-0101", "STAT400-0101", "ENGL393-0101", "ECON200-0101"],
  blocks: [{ id: "b1", label: "Work · McKeldin", days: [4], start: t(13), end: t(16), bldg: "MCK" }] as Block[],
};
export const DEFAULT_CART = ["MUSC130", "PHIL140", "CMSC320"];

