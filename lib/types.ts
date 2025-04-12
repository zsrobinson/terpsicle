// helper types for Course
type Semester = string;

export type Course = {
  code: string;
  name: string;
  credits: number;

  semester?: Semester | "Transfer";
  professor?: string;
  section?: string;
  geneds?: string[][];
  crosslist?: string[];
};
