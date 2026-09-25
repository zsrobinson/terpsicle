import { JSDOM } from "jsdom";
import { Defined, Section } from "./types";
import { scrapeCourses } from "~/lib/scrape-courses";

const TERM = "202508";
const REVALIDATE = 600;
function parseTime(timeStr: string): number {
  if (timeStr === "") return 0;

  const match = timeStr.match(/(\d+):(\d+)(am|pm)/i);
  // console.log("Checking match for timeStr:", timeStr);
  if (!match) throw new Error(`Invalid time format: ${timeStr}`);
  const [, hourStr, minuteStr, meridian] = match;

  let hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  if (meridian.toLowerCase() === "pm" && hour !== 12) {
    hour += 12;
  } else if (meridian.toLowerCase() === "am" && hour === 12) {
    hour = 0;
  }

  return hour * 60 + minute;
}

export async function scrapeSections(dept: string) {
  // console.log("Scraping sections for department:", dept);
  const courses = await scrapeCourses(dept);

  const courseConcat = courses.map((course) => course.code).join(",");

  const url = `https://app.testudo.umd.edu/soc/${TERM}/sections?courseIds=${courseConcat}`;

  console.log(url);

  
  const res = await fetch(url, { next: { revalidate: REVALIDATE } });
  const text = await res.text();
  const doc = new JSDOM(text).window.document;

  const sectionsList: Section[] = [];
  const sections = doc.querySelectorAll("div.course-sections");

  sections.forEach((courseSection) => {
    const deliverySections = courseSection.querySelectorAll(
      "div.section.delivery-f2f"
    );
    deliverySections.forEach((deliverySection) => {
      const sectionIdSpan = deliverySection.querySelector("span.section-id");
      const sectionId = sectionIdSpan?.textContent?.trim();
      const instructorSpan = deliverySection.querySelector(
        "span.section-instructor"
      );
      const instructor = instructorSpan?.textContent?.trim();

      const times: { [day: string]: { start: number; end: number }[] }[] = [];

      // console.log("Instructor:", instuctor);
      // console.log("Section ID (F2F):", sectionId);

      /* deliverySection.querySelectorAll("div.row").forEach(() => {
        const locationSpan = deliverySection.querySelector(
          "span.class-building"
        );
        const buildingCodeSpan =
          locationSpan?.querySelector("span.building-code");
        const roomSpan = locationSpan?.querySelector("span.class-room");
        const location = `${buildingCodeSpan?.textContent?.trim() || ""} ${
          roomSpan?.textContent?.trim() || ""
        }`;
      }); */

      const sectionInfoContainer = deliverySection.querySelector(
        "div.section-info-container"
      );

      const seatCountSpan = sectionInfoContainer?.querySelector(
        "span.total-seats-count"
      );
      const totalSeats = parseInt(
        seatCountSpan?.textContent?.trim() || "0",
        10
      );

      const openSeatsSpan = sectionInfoContainer?.querySelector(
        "span.open-seats-count"
      );
      const openSeats = parseInt(openSeatsSpan?.textContent?.trim() || "0", 10);

      const waitlistSpan = sectionInfoContainer?.querySelector(
        "span.waitlist.has-waitlist"
      );
      let waitlistSeats = 0;
      let holdfiledSeats = 0;

      if (waitlistSpan) {
        const waitlistCountSpan = waitlistSpan.querySelector(
          "span.waitlist-count"
        );
        const holdfileCountSpan = waitlistSpan.querySelectorAll(
          "span.waitlist-count"
        )[1];

        waitlistSeats = parseInt(
          waitlistCountSpan?.textContent?.trim() || "0",
          10
        );
        holdfiledSeats = parseInt(
          holdfileCountSpan?.textContent?.trim() || "0",
          10
        );
      }

      // console.log("Course ID", courseSection.id);
      // console.log("Section ID:", sectionId);
      // console.log("Waitlist:", waitlistSeats);
      // console.log("Holdfile:", holdfiledSeats);
      // console.log("Open Seats:", openSeats);
      // console.log("Total Seats:", totalSeats);

      const timeInfoContainer = deliverySection.querySelector(
        "div.class-days-container"
      );

      timeInfoContainer?.querySelectorAll("div.row").forEach((row) => {
        const dayTimeGroup = row.querySelector("div.section-day-time-group");
        const buildingGroup = row.querySelector(
          "div.section-class-building-group"
        );
        /* const classTypeSpan = row.querySelector("span.class-type"); */

        if (dayTimeGroup && buildingGroup) {
          const days =
            dayTimeGroup
              .querySelector("span.section-days")
              ?.textContent?.trim() || "";
          const startTimeText =
            dayTimeGroup
              .querySelector("span.class-start-time")
              ?.textContent?.trim() || "";
          const endTimeText =
            dayTimeGroup
              .querySelector("span.class-end-time")
              ?.textContent?.trim() || "";

          /* const buildingCode =
            buildingGroup
              .querySelector("span.building-code")
              ?.textContent?.trim() || "";
          const room =
            buildingGroup
              .querySelector("span.class-room")
              ?.textContent?.trim() || "";
          const location = `${buildingCode} ${room}`.trim();

          const isDiscussion =
            classTypeSpan?.textContent?.trim() === "Discussion"; */

          // console.log(startTimeText, endTimeText);

          console.log(`Course Code: ${courseSection.id}, Section ID: ${sectionId}`);
          
          // console.log(startTimeText, endTimeText);


          const startTime = parseTime(startTimeText);
          const endTime = parseTime(endTimeText);

          const dayMappings: { [key: string]: string } = {
            M: "M",
            Tu: "Tu",
            W: "W",
            Th: "Th",
            F: "F",
          };

          const parsedDays = days.match(/(M|Tu|W|Th|F)/g) || [];
          parsedDays.forEach((day) => {
            const mappedDay = dayMappings[day];
            if (mappedDay) {
              const dayTimes = times.find((t) => t[mappedDay]) || {
                [mappedDay]: [],
              };
              if (!times.includes(dayTimes)) {
                times.push(dayTimes);
              }

              
              dayTimes[mappedDay].push({
                start: startTime,
                end: endTime,
              });

              // console.log(startTime, endTime);
              // console.log(`Day: ${mappedDay}, Start: ${startTimeText}, End: ${endTimeText}, Location: ${location}, Is Discussion: ${isDiscussion}`);
            }
          });
        }
      });

      // ...existing code...

      const sectionTimes: Defined<Section["times"]> = [];

      timeInfoContainer?.querySelectorAll("div.row").forEach((row) => {
        const dayTimeGroup = row.querySelector("div.section-day-time-group");
        const buildingGroup = row.querySelector(
          "div.section-class-building-group"
        );
        const classTypeSpan = row.querySelector("span.class-type");

        if (dayTimeGroup && buildingGroup) {
          const days =
            dayTimeGroup
              .querySelector("span.section-days")
              ?.textContent?.trim() || "";
          const startTimeText =
            dayTimeGroup
              .querySelector("span.class-start-time")
              ?.textContent?.trim() || "";
          const endTimeText =
            dayTimeGroup
              .querySelector("span.class-end-time")
              ?.textContent?.trim() || "";

          const buildingCode =
            buildingGroup
              .querySelector("span.building-code")
              ?.textContent?.trim() || "";
          const room =
            buildingGroup
              .querySelector("span.class-room")
              ?.textContent?.trim() || "";
          const location = `${buildingCode} ${room}`.trim();

          const isDiscussion =
            classTypeSpan?.textContent?.trim() === "Discussion";

          
          const startTime = parseTime(startTimeText);
          const endTime = parseTime(endTimeText);

          const dayMappings: { [key: string]: string } = {
            M: "M",
            Tu: "Tu",
            W: "W",
            Th: "Th",
            F: "F",
          };

          const parsedDays = days.match(/(M|Tu|W|Th|F)/g) || [];
          parsedDays.forEach((day) => {
            const mappedDay = dayMappings[day];
            if (mappedDay) {
              sectionTimes.push({
                day: mappedDay,
                isDiscussion,
                location,
                start: startTime,
                end: endTime,
              });
            }
          });
        }
      });

      sectionsList.push({
        sectionCode: sectionId || "",
        courseCode: courseSection.id,
        professor: instructor || "",
        totalSeats,
        openSeats,
        waitlistSeats,
        holdfiledSeats,
        times: sectionTimes,
      });
    });
  });

  return sectionsList;
}
