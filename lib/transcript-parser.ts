// Take in a transcript string
// This can include the entire page or just the transcript text
// Return a list of Course objects

import { Course } from "./types";

export async function TranscriptParser(trans_string: string) {
  const lines: string[] = trans_string.split("\n");
  const date_regex: RegExp = /^(Spring|Summer|Fall|Winter) [0-9]{4}/;
  const course_regex: RegExp = /^    /; // Courses always start with at least 4 spaces
  const seasonMap: { [key: string]: string } = {
    Spring: "01",
    Summer: "05",
    Fall: "08",
    Winter: "12",
  };
  // Keep track of term
  // Start with transfer credits
  let cur_term: string = "Transfer";

  const courses: Course[] = [];

  let past_header: boolean = false;
  // Begin looping through file
  for (const line of lines) {
    if (/@/.test(line)) {
      past_header = true;
    }
    if (!past_header) {
      continue;
    }

    // Check to see if term is changing
    const trimmed_line = line.trim();
    if (date_regex.test(trimmed_line)) {
      cur_term = trimmed_line.match(date_regex)![0];
      const [season, year] = cur_term.split(" ");
      cur_term = `${year}${seasonMap[season]}`;
    }

    // Check if there is a course
    if (course_regex.test(line)) {
      // We have a course
      const line_entries = line.trim().split(/\s+/);
      if (cur_term == "Transfer") {
        ////////////////////////////////
        //// Parse transfer courses ////
        ////////////////////////////////
        //
        // Account for if it has a weird number out front
        if (/^[0-9]/.test(line_entries[0])) {
          line_entries.shift();
        }

        // Find index with either Pass, No Credit, or the Grade
        let index_after_name = 1;
        for (let i = 0; i < line_entries.length; i++) {
          if (/^(P|NC|[A-F])$/.test(line_entries[i])) {
            index_after_name = i;
            break;
          }
        }

        // Skip if no credit was gotten
        if (
          line_entries[index_after_name] == "NC" ||
          line_entries[line_entries.length - 1] == "Credit"
        ) {
          continue;
        }

        // Get course name
        const course_name = line_entries
          .slice(0, index_after_name)
          .join(" ")
          .split("/")[0]
          .split("SCR")[0]
          .trim();

        let index_before_geneds = 0;
        // Get cross-list if possible
        let course_code = "";
        let credits = 0;
        for (let i = index_after_name; i < line_entries.length; i++) {
          if (/^[A-Z]{4}[0-9]{3}$/.test(line_entries[i])) {
            course_code = line_entries[i];
            index_before_geneds = i;
            credits = parseInt(line_entries[i]);
            break;
          }
        }
        // Get credits
        for (let i = index_after_name; i < line_entries.length; i++) {
          if (/^[0-9]\.[0-9]{2}$/.test(line_entries[i])) {
            credits = parseInt(line_entries[i]);
            break;
          }
        }

        // If we found a cross-list, then geneds are everything after
        // If not, then geneds are after the GPA (4.00, etc.)
        let course_code_list: string[] = [];
        if (course_code == "") {
          for (let i = index_after_name; i < line_entries.length; i++) {
            if (/[0-9]\.[0-9]{2}/.test(line_entries[i])) {
              index_before_geneds = i;
              break;
            }
          }
        } else {
          course_code_list = [course_code];
        }
        const gened_list = line_entries.slice(index_before_geneds + 1);
        const geneds = ParseGenEdList(gened_list);

        courses.push({
          code: "Transfer",
          name: course_name,
          credits: credits,
          semester: cur_term,
          geneds: geneds,
          crosslist: course_code_list,
        });
      } else {
        ////////////////////////////////////
        //// Parse non-transfer courses ////
        ////////////////////////////////////

        // Get rid of garbage lines
        if (/Meth/.test(line_entries[0]) || /=/.test(line_entries[0])) {
          continue;
        }

        let index_after_name = 1;
        for (let i = 2; i < line_entries.length; i++) {
          if (/^[A-F](\+|-|)?W?$/.test(line_entries[i])) {
            index_after_name = i;
            break;
          }
        }
        let course_name = "";

        const course_code = line_entries[0];

        // See if we are parsing current course or not
        let course_is_curr = false;
        if (/^[0-9]{4}$/.test(line_entries[1])) {
          course_is_curr = true;
        }
        let gened_list = [];
        let credits = 0;
        if (!course_is_curr) {
          gened_list = line_entries.slice(index_after_name + 4);
          course_name = line_entries.slice(1, index_after_name).join(" ");
          credits = parseInt(line_entries[index_after_name + 1]);
        } else {
          // Disregard dropped courses
          if (line_entries[4] == "D") {
            continue;
          }
          gened_list = line_entries.slice(index_after_name + 3);
          credits = parseInt(line_entries[index_after_name - 2]);
        }
        const geneds = ParseGenEdList(gened_list);
        if (course_code === "" && course_name === "") {
          continue;
        }
        courses.push({
          code: course_code,
          name: course_name,
          credits: credits,
          semester: cur_term,
          geneds: geneds,
          crosslist: [],
        });
      }
    } else {
      continue;
    }
  }
  return courses;
}

function ParseGenEdList(gened_list: string[]) {
  const gened_string = gened_list.join(" ");
  const gened_ands = gened_string.split(",");
  const gened_ors: string[][] = [];
  for (let i = 0; i < gened_ands.length; i++) {
    gened_ors.push(gened_ands[i].split(" or "));
  }
  for (let i = 0; i < gened_ors.length; i++) {
    for (let j = 0; j < gened_ors[i].length; j++) {
      gened_ors[i][j] = gened_ors[i][j].trim();
    }
  }
  if (
    gened_ors.length == 1 &&
    gened_ors[0].length == 1 &&
    gened_ors[0][0] == ""
  ) {
    return [[]];
  }
  return gened_ors;
}
