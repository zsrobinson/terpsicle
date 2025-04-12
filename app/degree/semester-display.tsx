import { Semester } from "~/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Plus } from "lucide-react";

function formatGenEds(geneds: string[][] | undefined) {
  if (!geneds || geneds.length === 0) return null;
  
  return (
    <div className="flex flex-wrap gap-1 items-center mt-1">
      {geneds.map((group, index) => (
        <Badge 
          key={index}
          variant="outline"
          className="text-xs font-normal border-red-200 text-red-700 bg-red-50"
        >
          {group.join(" or ")}
        </Badge>
      ))}
    </div>
  );
}

export function SemesterDisplay({ 
  semesters,
  onAddCourse 
}: { 
  semesters: Semester[];
  onAddCourse: (semesterId: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
      {semesters.map((semester) => (
        <Card key={semester.id} className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{semester.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {semester.courses.map((course) => (
                <div 
                  key={course.code} 
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
                      <p className="text-sm text-gray-600 mt-0.5">{course.name}</p>
                    </div>
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