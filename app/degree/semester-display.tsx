import { Semester } from "~/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Plus, X } from "lucide-react";

type Area = "Area 1" | "Area 2" | "Area 3" | "Area 4" | "Area 5" | "Elective";
type CourseAreaMapping = Record<string, Area[]>;
type AreaColors = Record<Area, string>;
type Course = {
  code: string;
  name: string;
  credits: number;
  geneds?: string[][];
};

// Standardized course area mapping with all values as arrays
const courseAreaMapping: CourseAreaMapping = {
  // Area 1: Systems
  CMSC411: ["Area 1"],
  CMSC412: ["Area 1"],
  CMSC414: ["Area 1"],
  CMSC416: ["Area 1"],
  CMSC417: ["Area 1"],
  CMSC498B: ["Area 1"],
  CMSC498C: ["Area 1"],
  CMSC498I: ["Area 1"],
  CMSC498K: ["Area 1"],
  CMSC498X: ["Area 1"],
  // Area 2: Information Processing
  CMSC420: ["Area 2"],
  CMSC421: ["Area 2"],
  CMSC422: ["Area 2"],
  CMSC423: ["Area 2"],
  CMSC424: ["Area 2"],
  CMSC426: ["Area 2"],
  CMSC427: ["Area 2"],
  CMSC470: ["Area 2"],
  CMSC471: ["Area 2", "Area 3"],
  CMSC472: ["Area 2"],
  CMSC498D: ["Area 2"],
  CMSC498E: ["Area 2"],
  CMSC498F: ["Area 2"],
  CMSC498V: ["Area 2"],
  CMSC498Y: ["Area 2"],
  CMSC498Z: ["Area 2"],
  // Area 3: Software Engineering and Programming Languages
  CMSC430: ["Area 3"],
  CMSC433: ["Area 3"],
  CMSC434: ["Area 3"],
  CMSC435: ["Area 3"],
  CMSC436: ["Area 3"],
  // Area 4: Theory
  CMSC451: ["Area 4"],
  CMSC452: ["Area 4"],
  CMSC454: ["Area 4"],
  CMSC456: ["Area 4"],
  CMSC457: ["Area 4"],
  CMSC474: ["Area 4"],
  // Area 5: Numerical Analysis
  CMSC460: ["Area 5"],
  CMSC466: ["Area 5"],
  // Electives
  CMSC320: ["Elective"],
  CMSC335: ["Elective"],
  CMSC388: ["Elective"],
  CMSC389: ["Elective"],
  CMSC395: ["Elective"],
  CMSC396: ["Elective"],
  CMSC401: ["Elective"],
  CMSC425: ["Elective"],
  CMSC473: ["Elective"],
  CMSC475: ["Elective"],
  CMSC476: ["Elective"],
  CMSC477: ["Elective"],
  CMSC488A: ["Elective"],
  CMSC498: ["Elective"],
  CMSC498A: ["Elective"],
  CMSC499A: ["Elective"],
  CMSC498G: ["Elective"],
};

// Color mapping for different areas
const areaColors: AreaColors = {
  "Area 1": "#4299e1", // Blue
  "Area 2": "#48bb78", // Green
  "Area 3": "#ed8936", // Orange
  "Area 4": "#9f7aea", // Purple
  "Area 5": "#f56565", // Red
  Elective: "#718096", // Gray
};

function formatGenEds(geneds: string[][] | undefined) {
  if (
    !geneds ||
    geneds.length === 0 ||
    (geneds.length === 1 && geneds[0].length === 0)
  )
    return null;
  // console.log(geneds);
  return (
    <div className="flex flex-wrap gap-1 items-center mt-1">
      {geneds.map((group, index) => (
        <Badge
          key={index}
          variant="outline"
          className="text-xs font-normal border border-red-500  bg-red-900/30"
        >
          {group.join(" or ")}
        </Badge>
      ))}
    </div>
  );
}

function formatAreas(courseCode: string) {
  const areas = courseAreaMapping[courseCode];
  if (!areas || areas.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 items-center mt-1">
      <Badge
        variant="outline"
        className="text-xs font-normal"
        style={{
          borderColor: `${areaColors[areas[0]]}30`,
          backgroundColor: `${areaColors[areas[0]]}10`,
          color: areaColors[areas[0]],
        }}
      >
        {areas.length > 1 ? areas.join(" or ") : areas[0]}
      </Badge>
    </div>
  );
}

export function SemesterDisplay({
  semesters,
  onAddCourse,
  onRemoveCourse,
}: {
  semesters: Semester[];
  onAddCourse: (semesterId: string) => void;
  onRemoveCourse: (semesterId: string, index: number) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
      {semesters.map((semester) => (
        <Card
          key={semester.id}
          id={semester.id}
          className="hover:shadow-md transition-shadow"
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{semester.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {semester.courses.map((course, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-1 p-3 border rounded-lg"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-base">{course.code}</p>
                        <Badge variant="secondary" className="text-xs">
                          {course.credits} credits
                        </Badge>
                      </div>
                      <p className="text-sm mt-0.5">{course.name}</p>
                      {formatAreas(course.code)}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-gray-500 hover:text-red-600"
                      onClick={() => onRemoveCourse(semester.id, i)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {formatGenEds(course.geneds)}
                </div>
              ))}
              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={() => onAddCourse(semester.id)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Course
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
