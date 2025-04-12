// helper types for Course
type Semester = string;

export type Course = {
  code: string;
  name: string;
  credits: number;

  semester?: Semester | "Transfer";
  geneds?: string[][];
  crosslist?: string[];
};


export type Section = {
  semester?: Semester;
  professor?: string;
  sectionCode: string;
  courseCode: string;
  
  times?: {
    [day: string]: {isDiscussion: boolean; location: string; start: Date; end: Date }[]; 
  }[]

  totalSeats: number;
  openSeats: number;
  waitlistSeats: number;
  holdfiledSeats: number;

};
