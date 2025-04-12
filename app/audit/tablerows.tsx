"use client";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Course } from "~/lib/types";
import { Requirement } from "~/lib/types";
import React from "react";

//// FOR TESTING REMOVE LATER
import { TranscriptParser } from "~/lib/transcript-parser";
const output = TranscriptParser(`Skip to Main Content
University of Maryland Home Page

Unofficial TranscriptMain Menu Toggle Dropdown
Testudo
Simon AmbrozakUser Toggle Dropdown
    Print this Document

        
                                    UNIVERSITY OF MARYLAND
                                        COLLEGE PARK
                                    Office of the Registrar
                                    College Park, MD 20742
                                    UNOFFICIAL TRANSCRIPT
                                FOR ADVISING PURPOSES ONLY 
                                        As of:  04/11/25
Ambrozak, Simon
E-Mail: sambroza@terpmail.umd.edu
Major: Computer Science
Freshman - First Time                    Undergraduate Degree Seeking
GenEd Program                            Current Status: Registered Fall 2025
Minor: MATHEMATICS

Fundamental Requirement Satisfied Math: AP; English: ENGL Course

Transcripts received from the following institutions:

Advanced Placement Exam                  on 07/04/23

Montgomery College                       on 08/28/24

** Transfer Credit Information **                   ** Equivalences **

Advanced Placement Exam
    2101  COMP SCI A/SCR 5         P        4.00 CMSC131
            COMP SCI PRIN/SCR 5      NC       0.00 No Credit
            U.S. GVPT/SCR 4          P        3.00 GVPT170       DSHS
    2201   MACROECON/SCR 5          P        3.00 ECON201       DSHS
            MICROECON/SCR 5          P        3.00 ECON200       DSHS
            WORLD HISTORY/SCR 5      P        3.00               L1
            CALC BC/AB SUBSCR 5      P        0.00 No Credit
            CALCULUS BC/SCR 5        P        4.00 MATH140       FSAR, FSMA
            CALCULUS BC/SCR 5        P        4.00 MATH141
            MUSIC THRY-AUR/SCR 3     NC       0.00 No Credit
            MUSIC THRY/NON/SCR 5     NC       0.00 No Credit
            MUSIC THRY SCR 4         P        3.00 MUSC140       DSSP
            PHYSICS 1 ALGEBRA/SCR5   P        4.00 PHYS121       DSNL
            PHYSICS 2 ALGEBRA/SCR4   P        4.00 PHYS122       DSNL
    2301   ENVRNMNTL SCI/SCR 5      P        3.00               DSNS
            STATISTICS/SCR 4         P        3.00 STAT100       FSAR, FSMA
Acceptable UG Inst. Credits:                41.00
Applicable UG Inst. Credits:                41.00

Montgomery College
    2405   MULTIVARIABLE CALCULUS   A        4.00 MATH241
Acceptable UG Inst. Credits:                 4.00
Applicable UG Inst. Credits:                 4.00

Total UG Credits Acceptable:                45.00
Total UG Credits Applicable:                45.00

Historic Course Information is listed in the order:
Course, Title, Grade, Credits Attempted, Earned and Quality Points

Fall 2023                               
MAJOR: COMPUTER SCIENCE          COLLEGE: COMP, MATH, & NAT SCI         
        CMSC132  OBJECT-ORIENTED PROG II  A  4.00  4.00 16.00
        ENGL101  ACADEMIC WRITING         A- 3.00  3.00 11.10 FSAW
        HNUH100  GATEWAY SEMINAR          A+ 1.00  1.00  4.00
        HNUH228U A LIFE WORTH LIVING      A  3.00  3.00 12.00 DSHU
        HNUH278V CLIMATE CHANGE & DISEASE A  3.00  3.00 12.00
** Semester Academic Honors **
Semester:       Attempted 14.00; Earned 14.00; QPoints   55.10; GPA 3.935
UG Cumulative:            14.00;        14.00;           55.10;     3.935

Spring 2024                             
MAJOR: COMPUTER SCIENCE          COLLEGE: COMP, MATH, & NAT SCI         
        CMSC216  INTRO TO CMPTR SYSTEMS   A+ 4.00  4.00 16.00
        CMSC250  DISCRETE STRUCTURES      A  4.00  4.00 16.00
        HNUH228B REDESIGNING LIFE         A- 3.00  3.00 11.10 DSNS, SCIS
        MATH206  INTRODUCTION TO MATLAB   A+ 1.00  1.00  4.00
        MATH240  INTR TO LINEAR ALGEBRA   A+ 4.00  4.00 16.00
** Semester Academic Honors **
Semester:       Attempted 16.00; Earned 16.00; QPoints   63.10; GPA 3.943
UG Cumulative:            30.00;        30.00;          118.20;     3.940

Fall 2024                               
MAJOR: COMPUTER SCIENCE          COLLEGE: COMP, MATH, & NAT SCI         
        CMSC330  ORGNZTN PROGM LANG       A+ 3.00  3.00 12.00
        CMSC351  ALGORITHMS               A  3.00  3.00 12.00
        CMSC396H HONORS SEMINAR           A  1.00  1.00  4.00
        COMM107  ORAL COMM PRIN           A+ 3.00  3.00 12.00 FSOC
        HNUH278B DEMOCRATIC HABITS        A- 3.00  3.00 11.10 DSHU, SCIS
        STAT400  APPLIED PROB & STAT I    A+ 3.00  3.00 12.00
** Semester Academic Honors **
Semester:       Attempted 16.00; Earned 16.00; QPoints   63.10; GPA 3.943
UG Cumulative:            46.00;        46.00;          181.30;     3.941

UG Cumulative Credit   :  91.00
UG Cumulative GPA      :   3.941

** Current Course Information **

Spring 2025    Course   Sec  Credits  Grd/ Drop   Add      Drop    Modified GenEd
                                        Meth /Add  Date      Date      Date
                ======== ==== =======  ==== ==== ======== ========  ======== ==================
                MUSC204  0106    3.00  REG  A    11/19/24           11/19/24 DSHU, DVUP
                MATH405  0401    3.00  REG  AW   11/18/24           11/19/24
                HNUH300  1001    2.00  REG  A    11/17/24           11/17/24
                MUSC204  0109    3.00  REG  D    11/17/24 11/19/24  11/19/24 DSHU, DVUP
                CMSC498Y 0101    3.00  REG  A    11/08/24           11/08/24
                MATH401  0401    3.00  REG  D    11/07/24 11/20/24  11/20/24
                ENGL393  9021    3.00  REG  A    11/07/24           11/07/24 FSPW
                CMSC320  0201    3.00  REG  A    11/07/24           11/07/24
                HNUH300  0701    2.00  REG  D    11/07/24 11/17/24  11/17/24
                MUSC204  0104    3.00  REG  D    11/07/24 11/17/24  11/17/24 DSHU, DVUP

Fall 2025      Course   Sec  Credits  Grd/ Drop   Add      Drop    Modified GenEd
                                        Meth /Add  Date      Date      Date
                ======== ==== =======  ==== ==== ======== ========  ======== ==================
                MATH463  0101    3.00  REG  A    04/03/25           04/03/25
                MATH401  0212    3.00  REG  A    04/03/25           04/03/25
                CMSC414  0101    3.00  REG  A    04/03/25           04/03/25
                MATH401  0111    3.00  REG  D    04/03/25 04/03/25  04/03/25
                CMSC475  0101    3.00  REG  A    04/03/25           04/03/25
                AAST351  0101    3.00  REG  A    04/03/25           04/03/25 DSSP, DVUP

    
Please send any questions or comments to registrar-help@umd.edu.
Web Accessibility

© 2015 University of Maryland`);

//////////////////////////

const CURTERM = "202501";
export function GenEdBody() {
  //const trackjsonstr = localStorage.getItem("track") || `{"track": "General"}`;
  //const coursesjsonstr = localStorage.getItem("courses") || `{"courses": []}`;
  //const track: string = JSON.parse(trackjsonstr)["track"];
  //const courses: Course[] = sortCoursesBySemester(JSON.parse(coursesjsonstr)["courses"]);
  const track = "General";
  const courses: Course[] = sortCoursesBySemester(output); // TESTING LINE
  // const courses: Course[] = sortCoursesBySemester([]]);
  // prettier-ignore
  var gened_reqs: Requirement[] = [
    { name: "FSAW", credits: 3, fulfilled: 0, courses: [], status: "Incomplete" },
    { name: "FSPW", credits: 3, fulfilled: 0, courses: [], status: "Incomplete" },
    { name: "FSOC", credits: 3, fulfilled: 0, courses: [], status: "Incomplete" },
    { name: "FSMA", credits: 3, fulfilled: 0, courses: [], status: "Incomplete" },
    { name: "FSAR", credits: 3, fulfilled: 0, courses: [], status: "Incomplete" },
    { name: "DSNL", credits: 4, fulfilled: 0, courses: [], status: "Incomplete" },
    { name: "DSNS or DSNL", credits: 3, fulfilled: 0, courses: [], status: "Incomplete" },
    { name: "DSHU", credits: 6, fulfilled: 0, courses: [], status: "Incomplete" },
    { name: "DSSP", credits: 6, fulfilled: 0, courses: [], status: "Incomplete" },
    { name: "SCIS", credits: 6, fulfilled: 0, courses: [], status: "Incomplete" },
    { name: "DVUP", credits: 3, fulfilled: 0, courses: [], status: "Incomplete" },
    { name: "DVUP or DVCC", credits: 3, fulfilled: 0, courses: [], status: "Incomplete" },
  ];

  // Go through courses from first -> last taken
  for (const course of courses) {
    // Ensure course has a semester
    if (!course.semester) {
      continue;
    }
    // Go through gened credits
    for (const geneds of course.geneds || []) {
      // Fix the gened "ors"
      var cur_gened = geneds[0];
      if (geneds.length != 1) {
        // Assign the "or" greedily
        outerloop: for (const gened of geneds) {
          for (const requirement of gened_reqs) {
            if (
              requirement.fulfilled < requirement.credits &&
              requirement.name.includes(gened)
            ) {
              cur_gened = gened;
              break outerloop;
            }
          }
        }
        var cur_gened = geneds[0];
      }
      // "or"s are fixed now
      // Now we know what gened we're fulfilling, we can simply assign to the credit and update status and such
      reqloop: for (const requirement of gened_reqs) {
        // Make sure gened credit reqs aren't already filled
        if (
          requirement.fulfilled < requirement.credits &&
          requirement.name.includes(cur_gened)
        ) {
          // Failsafe to see if this class was already placed in an "or"
          if (requirement.name.includes("or")) {
            console.log("Here1");
            const [req1, req2] = requirement.name.split(" or ").slice(0, 2);
            for (const requirementcheck of gened_reqs) {
              if (
                (requirementcheck.name == req1 ||
                  requirementcheck.name == req2) &&
                requirementcheck.courses.includes(course)
              ) {
                break reqloop;
              }
            }
          }
          requirement.courses.push(course);
          requirement.fulfilled += course.credits;
          if (requirement.fulfilled >= requirement.credits) {
            if (
              (course.semester || "") < CURTERM ||
              (course.semester || "") == "Transfer"
            ) {
              requirement.status = "Complete";
            } else if ((course.semester || "") == CURTERM) {
              requirement.status = "In Progress";
            } else {
              requirement.status = "Planned";
            }
          }
        }
      }
    }
  }

  //// Requirements are done
  //// Convert requirements into pretty table rows
  return (
    <>
      {gened_reqs.map((req, idx) => {
        const statusColor =
          {
            Incomplete: "bg-red-700",
            Planned: "bg-purple-700",
            "In Progress": "bg-blue-700",
            Complete: "bg-green-700",
          }[req.status] || "";

        return (
          <TableRow key={idx} className={statusColor}>
            <TableCell className="font-medium">{req.name}</TableCell>
            <TableCell>{req.credits}</TableCell>
            <TableCell>{req.fulfilled}</TableCell>
            <TableCell>
              {req.courses
                .map((c) => {
                  if (c.name != "") {
                    return c.name;
                  } else {
                    return c.code;
                  }
                })
                .join(", ")}
            </TableCell>
            <TableCell className="text-right">{req.status}</TableCell>
          </TableRow>
        );
      })}
    </>
  );
}
export function MakeUpperLevelRows() {
  const upper_electives = [
    "CMSC320",
    "CMSC335",
    "CMSC388",
    "CMSC389",
    "CMSC395",
    "CMSC396",
    "CMSC401",
    "CMSC425",
    "CMSC473",
    "CMSC475",
    "CMSC476",
    "CMSC477",
    "CMSC488A",
    "CMSC498",
    "CMSC498A",
    "CMSC499A",
  ];

  const area1 = [
    "CMSC411",
    "CMSC412",
    "CMSC414",
    "CMSC416",
    "CMSC417",
    "CMSC498B",
    "CMSC498C",
    "CMSC498I",
    "CMSC498K",
    "CMSC498X",
  ];

  const area2 = [
    "CMSC420",
    "CMSC421",
    "CMSC422",
    "CMSC423",
    "CMSC424",
    "CMSC426",
    "CMSC427",
    "CMSC470",
    "CMSC471", // Appears in Area 2 or Area 3
    "CMSC472",
    "CMSC498D",
    "CMSC498E",
    "CMSC498F",
    "CMSC498V",
    "CMSC498Y",
    "CMSC498Z",
  ];

  const area3 = [
    "CMSC430",
    "CMSC433",
    "CMSC434",
    "CMSC435",
    "CMSC436",
    "CMSC471", // Appears in Area 2 or Area 3
  ];

  const area4 = [
    "CMSC451",
    "CMSC452",
    "CMSC454",
    "CMSC456",
    "CMSC457",
    "CMSC474",
  ];

  const area5 = ["CMSC460", "CMSC466"];

  const general_track_reqs: { [key: string]: number } = {
    TotalUpperLevel: 15,
    "1stArea": 3, // Overlap
    "2ndArea": 3, // Overlap
    "3rdArea": 3, // Overlap
    Electives: 6,
  };

  const cyber_courses: string[] = [
    "CMSC411",
    "CMSC412",
    "CMSC417",
    "CMSC430",
    "CMSC433",
    "CMSC451",
  ];
  const cyber_track_reqs: { [key: string]: number } = {
    "1stArea": 3, // Overlap
    "2ndArea": 3, // Overlap
    "3rdArea": 3, // Overlap
    UpperElectives: 3,
    CMSC414: 3,
    CMSC456: 3,
    CyberCourses: 12,
  };

  const data_group1_courses: string[] = [
    "CMSC420",
    "CMSC421",
    "CMSC423",
    "CMSC425",
    "CMSC426",
    "CMSC427",
    "CMSC470",
  ];
  const data_group2_courses: string[] = ["CMSC451", "CMSC454", "CMSC460"];
  const data_group3_courses: string[] = [
    "CMSC411",
    "CMSC412",
    "CMSC414",
    "CMSC417",
    "CMSC430",
    "CMSC433",
    "CMSC434",
    "CMSC435",
  ];
  const data_track_reqs: { [key: string]: number } = {
    "1stArea": 3, // Overlap
    "2ndArea": 3, // Overlap
    "3rdArea": 3, // Overlap
    CMSC422: 3,
    CMSC424: 3,
    DataGroup1: 3,
    DataGroup2: 3,
    DataGroup3: 3,
  };

  const quantum_track_reqs: { [key: string]: number } = {
    "1stArea": 3, // Not area 4 // Overlap
    "2ndArea": 3, // Not area 4 // Overlap
    CMSC457: 3,
    PHYS467: 3,
    TotalUpperLevel: 12, // Not CMSC457
  };

  const ml_track_reqs: { [key: string]: number } = {
    "1stArea": 3, // Overlap
    "2ndArea": 3, // Overlap
    "3rdArea": 3, // Overlap
    CMSC320: 3,
    CMSC421: 3,
    CMSC422: 3,
    UpperElectives: 6, // Not CMSC457
  };
}

function sortCoursesBySemester(courses: Course[]): Course[] {
  return courses.sort((a, b) => {
    const semA = a.semester ?? "";
    const semB = b.semester ?? "";

    // "Transfer" comes first
    if (semA === "Transfer" && semB !== "Transfer") return -1;
    if (semB === "Transfer" && semA !== "Transfer") return 1;

    // Fallback to simple string comparison
    return semA.localeCompare(semB);
  });
}
