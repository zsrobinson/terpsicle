// helper types for Course
type Semester = string;

export type Course = {
  code: string;
  name: string;
  credits: number;

  semester?: Semester | "Transfer";
  professor?: string;
  section?: string;
  geneds?: string[][]; // List of "ors", list of len 1 = no "or"
  crosslist?: string[];
};

export type Requirement = {
  name: string;
  credits: number;
  fulfilled: number;
  courses: Course[];
  status: "Complete" | "In Progress" | "Planned" | "Incomplete";
};
