"use client";

import { Label } from "~/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "~/components/ui/select";
import { SemesterDisplay } from "./semester-display";
import { Semester, Course } from "~/lib/types";
import { useState, useEffect } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "~/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";

// Sample data - in a real app, this would come from your backend or state management
const sampleSemesters: Semester[] = [
  {
    id: "202501",
    name: "Spring 2025",
    courses: [
    ],
  },
  {
    id: "202508",
    name: "Fall 2025",
    courses: [
      {
        code: "CMSC414",
        name: "Computer and Network Security",
        credits: 3,
      },
      {
        code: "CMSC475",
        name: "Machine Learning",
        credits: 3,
      },
    ],
  },
];

const semesterOptions = [
  { value: "202108", label: "Fall 2021" },
  { value: "202201", label: "Spring 2022" },
  { value: "202208", label: "Fall 2022" },
  { value: "202301", label: "Spring 2023" },
  { value: "202308", label: "Fall 2023" },
  { value: "202401", label: "Spring 2024" },
  { value: "202408", label: "Fall 2024" },
  { value: "202501", label: "Spring 2025" },
];

function generateSemesters(start: string, end: string, existingSemesters: Semester[] = []): Semester[] {
  const startIndex = semesterOptions.findIndex(opt => opt.value === start);
  const endIndex = semesterOptions.findIndex(opt => opt.value === end);
  
  if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) {
    return [];
  }

  return semesterOptions
    .slice(startIndex, endIndex + 1)
    .map(opt => {
      // Find existing semester data if it exists
      const existingSemester = existingSemesters.find(sem => sem.id === opt.value);
      return {
        id: opt.value,
        name: opt.label,
        courses: existingSemester?.courses || []
      };
    });
}

export default function Page() {
  const [startSemester, setStartSemester] = useState("202501");
  const [endSemester, setEndSemester] = useState("202501");
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingChange, setPendingChange] = useState<{type: "start" | "end", value: string} | null>(null);
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [selectedSemesterId, setSelectedSemesterId] = useState<string | null>(null);
  const [newCourse, setNewCourse] = useState({ code: "", name: "", credits: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Course[]>([]);

  useEffect(() => {
    setSemesters(generateSemesters(startSemester, endSemester, semesters));
  }, [startSemester, endSemester]);

  const handleSemesterChange = (type: "start" | "end", value: string) => {
    const currentSemesters = generateSemesters(
      type === "start" ? value : startSemester,
      type === "end" ? value : endSemester,
      semesters
    );

    // Check if any semesters with courses would be removed
    const wouldRemoveCourses = semesters.some(sem => {
      const willBeRemoved = !currentSemesters.some(newSem => newSem.id === sem.id);
      return willBeRemoved && sem.courses.length > 0;
    });

    if (wouldRemoveCourses) {
      setPendingChange({ type, value });
      setShowConfirmation(true);
    } else {
      if (type === "start") {
        setStartSemester(value);
      } else {
        setEndSemester(value);
      }
    }
  };

  const handleConfirmation = (confirmed: boolean) => {
    if (confirmed && pendingChange) {
      if (pendingChange.type === "start") {
        setStartSemester(pendingChange.value);
      } else {
        setEndSemester(pendingChange.value);
      }
    }
    setShowConfirmation(false);
    setPendingChange(null);
  };

  const handleAddCourse = () => {
    if (!selectedSemesterId) return;

    setSemesters(prevSemesters => 
      prevSemesters.map(semester => {
        if (semester.id === selectedSemesterId) {
          return {
            ...semester,
            courses: [...semester.courses, newCourse]
          };
        }
        return semester;
      })
    );

    setShowAddCourse(false);
    setNewCourse({ code: "", name: "", credits: 0 });
  };

  const handleCourseCodeChange = async (value: string) => {
  setNewCourse(prev => ({ ...prev, code: value }));

  // Check if we have a valid department code or partial course code
  const match = value.match(/^([A-Z]{4})(\d{0,3})$/);
  if (match) {
    const dept = match[1]; // Extract department code (e.g., CMSC)
    const partialCode = match[2]; // Extract partial course number (e.g., 4, 41, etc.)
    setIsLoading(true);
    try {
      const response = await fetch(`/api/courses?dept=${dept}`);
      if (!response.ok) {
        throw new Error('Failed to fetch courses');
      }
      const courses: Course[] = await response.json();

      // Filter courses based on the partial code
      const filteredCourses = courses.filter(course =>
        course.code.startsWith(dept + partialCode)
      );

      setSuggestions(filteredCourses);
    } catch (error) {
      console.error("Failed to fetch courses:", error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  } else {
    setSuggestions([]);
  }
};

  const handleSuggestionClick = (course: Course) => {
    setNewCourse({
      code: course.code,
      name: course.name,
      credits: course.credits
    });
    setSuggestions([]);
  };

  return (
    <main className="flex flex-col gap-4 items-start w-full">
      <div className="flex gap-4">
        <Label>Starting Semester</Label>
        <Select 
          value={startSemester} 
          onValueChange={(value) => handleSemesterChange("start", value)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select a Semester" />
          </SelectTrigger>
          <SelectContent>
            {semesterOptions.map((option) => (
              <SelectItem 
                key={option.value} 
                value={option.value}
                disabled={option.value > endSemester}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Label>Graduation</Label>
        <Select 
          value={endSemester} 
          onValueChange={(value) => handleSemesterChange("end", value)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select a Semester" />
          </SelectTrigger>
          <SelectContent>
            {semesterOptions.map((option) => (
              <SelectItem 
                key={option.value} 
                value={option.value}
                disabled={option.value < startSemester}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Label>Track</Label>
        <Select defaultValue="general">
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select a Track" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="general">General Track</SelectItem>
            <SelectItem value="cyber">Cybersecurity</SelectItem>
            <SelectItem value="data">Data Science</SelectItem>
            <SelectItem value="quantum">Quantum Information</SelectItem>
            <SelectItem value="ml">Machine Learning</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="w-full mt-8">
        <h2 className="text-2xl font-semibold mb-4">Your Schedule</h2>
        <SemesterDisplay 
          semesters={semesters} 
          onAddCourse={(semesterId) => {
            setSelectedSemesterId(semesterId);
            setShowAddCourse(true);
          }}
        />
      </div>

      <AlertDialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Semester Change</AlertDialogTitle>
            <AlertDialogDescription>
              Changing the semester range will remove some semesters that contain courses. Are you sure you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleConfirmation(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleConfirmation(true)}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showAddCourse} onOpenChange={setShowAddCourse}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Course</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="code">Course Code</Label>
              <div className="relative">
                <Input
                  id="code"
                  value={newCourse.code}
                  onChange={(e) => handleCourseCodeChange(e.target.value)}
                  placeholder="e.g. CMSC131"
                />
                {isLoading && (
                  <div className="absolute right-2 top-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
                  </div>
                )}
                {suggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg">
                    {suggestions.map((course) => (
                      <div
                        key={course.code}
                        className="px-4 py-2 cursor-pointer"
                        onClick={() => handleSuggestionClick(course)}
                      >
                        <div className="font-medium text-black font-bold">{course.code}</div>
                        <div className="text-sm text-gray-600">{course.name}</div>
                        <div className="text-xs text-gray-500">{course.credits} credits</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name">Course Name</Label>
              <Input
                id="name"
                value={newCourse.name}
                onChange={(e) => setNewCourse(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Introduction to Computer Science"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="credits">Credits</Label>
              <Input
                id="credits"
                type="number"
                value={newCourse.credits}
                onChange={(e) => setNewCourse(prev => ({ ...prev, credits: parseInt(e.target.value) || 0 }))}
                placeholder="e.g. 3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddCourse(false)}>Cancel</Button>
            <Button onClick={handleAddCourse}>Add Course</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
