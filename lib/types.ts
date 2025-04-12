// helper types for Course
type Semester = string;
type CourseCodeLeaf = string;
type CourseCodeNode = {
  op: "and" | "or";
  a: CourseCodeNode | CourseCodeLeaf;
  b: CourseCodeNode | CourseCodeLeaf;
};

export type Course = {
  code: CourseCodeLeaf;
  name: string;
  credits: number;

  semester?: Semester | "Prior Learning";
  professor?: string;
  section?: string;
  geneds?: CourseCodeNode;
  crosslist?: CourseCodeLeaf[];
};
