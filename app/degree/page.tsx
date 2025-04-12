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
import { useState, useEffect, useMemo } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "~/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Switch } from "~/components/ui/switch";
import { useLocalStorage} from "~/lib/use-local-storage";

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

const allSemesterOptions = [
  { value: "202108", label: "Fall 2021 🍂" },
  { value: "202112", label: "Winter 2021 ❄️" },
  { value: "202201", label: "Spring 2022 🌸" },
  { value: "202205", label: "Summer 2022 ☀️" },
  { value: "202208", label: "Fall 2022 🍂" },
  { value: "202212", label: "Winter 2022 ❄️" },
  { value: "202301", label: "Spring 2023 🌸" },
  { value: "202305", label: "Summer 2023 ☀️" },
  { value: "202308", label: "Fall 2023 🍂" },
  { value: "202312", label: "Winter 2023 ❄️" },
  { value: "202401", label: "Spring 2024 🌸" },
  { value: "202405", label: "Summer 2024 ☀️" },
  { value: "202408", label: "Fall 2024 🍂" },
  { value: "202412", label: "Winter 2024 ❄️" },
  { value: "202501", label: "Spring 2025 🌸" },
  { value: "202505", label: "Summer 2025 ☀️" },
  { value: "202508", label: "Fall 2025 🍂" },
  { value: "202512", label: "Winter 2025 ❄️" },
  { value: "202601", label: "Spring 2026 🌸" },
  { value: "202605", label: "Summer 2026 ☀️" },
  { value: "202608", label: "Fall 2026 🍂" },
  { value: "202612", label: "Winter 2026 ❄️" },
  { value: "202701", label: "Spring 2027 🌸" },
  { value: "202705", label: "Summer 2027 ☀️" },
  { value: "202708", label: "Fall 2027 🍂" },
  { value: "202712", label: "Winter 2027 ❄️" },
  { value: "202801", label: "Spring 2028 🌸" },
  { value: "202805", label: "Summer 2028 ☀️" },
  { value: "202808", label: "Fall 2028 🍂" },
  { value: "202812", label: "Winter 2028 ❄️" },
  { value: "202901", label: "Spring 2029 🌸" }
];

function generateSemesters(start: string, end: string, existingSemesters: Semester[] = []): Semester[] {
  const startIndex = allSemesterOptions.findIndex(opt => opt.value === start);
  const endIndex = allSemesterOptions.findIndex(opt => opt.value === end);
  
  if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) {
    return existingSemesters;  // Return existing semesters if range is invalid
  }

  // Get all semester IDs in the selected range
  const rangeIds = allSemesterOptions
    .slice(startIndex, endIndex + 1)
    .map(opt => opt.value);

  // Keep existing semesters that are in range and their courses
  const preservedSemesters = existingSemesters.filter(sem => 
    rangeIds.includes(sem.id)
  );

  // Add any missing semesters from the range
  const newSemesters = rangeIds.map(id => {
    const existing = preservedSemesters.find(sem => sem.id === id);
    if (existing) return existing;

    const option = allSemesterOptions.find(opt => opt.value === id)!;
    return {
      id: option.value,
      name: option.label,
      courses: []
    };
  });

  return newSemesters;
}

export default function Page() {
  const [startSemester, setStartSemester] = useLocalStorage<string>("start-semester", "202501");
  const [endSemester, setEndSemester] = useLocalStorage<string>("end-semester", "202501");
  const [storedCourses, setStoredCourses] = useLocalStorage<{[semesterId: string]: Course[]}>('semester-courses', {});
  const [showTransfer, setShowTransfer] = useLocalStorage<boolean>("show-transfer", false);
  const [showAllSemesters, setShowAllSemesters] = useLocalStorage<boolean>("show-all-semesters", false);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingChange, setPendingChange] = useState<{type: "start" | "end", value: string} | null>(null);
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [selectedSemesterId, setSelectedSemesterId] = useState<string | null>(null);
  const [newCourse, setNewCourse] = useState<Course>({ code: "", name: "", credits: 0, geneds: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Course[]>([]);

  const semesterOptions = useMemo(() => {
    if (showAllSemesters) {
      return allSemesterOptions;
    }
    return allSemesterOptions.filter(opt => {
      const month = parseInt(opt.value.slice(-2));
      return month === 1 || month === 8; // Only spring (01) and fall (08)
    });
  }, [showAllSemesters]);

  // Generate base semesters and merge with stored courses
  useEffect(() => {
    const startIndex = semesterOptions.findIndex(opt => opt.value === startSemester);
    const endIndex = semesterOptions.findIndex(opt => opt.value === endSemester);
    
    if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) {
      setSemesters([]);
      return;
    }

    const regularSemesters = semesterOptions
      .slice(startIndex, endIndex + 1)
      .map(opt => ({
        id: opt.value,
        name: opt.label,
        courses: storedCourses[opt.value] || []
      }));

    const allSemesters = showTransfer 
      ? [
          {
            id: "transfer",
            name: "Transfer Credits 🧾",
            courses: storedCourses["transfer"] || []
          },
          ...regularSemesters
        ]
      : regularSemesters;

    setSemesters(allSemesters);
  }, [startSemester, endSemester, storedCourses, showTransfer, semesterOptions]);

  const handleSemesterChange = (type: "start" | "end", value: string) => {
    const futureStartSem = type === "start" ? value : startSemester;
    const futureEndSem = type === "end" ? value : endSemester;
    
    // Check if any semesters with courses would be removed
    const startIdx = semesterOptions.findIndex(opt => opt.value === futureStartSem);
    const endIdx = semesterOptions.findIndex(opt => opt.value === futureEndSem);
    const futureRange = semesterOptions.slice(startIdx, endIdx + 1).map(opt => opt.value);
    
    const wouldRemoveCourses = Object.entries(storedCourses).some(([semId, courses]) => 
      courses.length > 0 && !futureRange.includes(semId)
    );

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

    const courseWithSemester: Course = {
      ...newCourse,
      semester: selectedSemesterId
    };

    const updatedCourses = {
      ...storedCourses,
      [selectedSemesterId]: [...(storedCourses[selectedSemesterId] || []), courseWithSemester]
    };
    setStoredCourses(updatedCourses);
    setShowAddCourse(false);
    setSelectedSemesterId(null);
    setNewCourse({ code: "", name: "", credits: 0, geneds: [] });
  };

  const handleRemoveCourse = (semesterId: string, index: number) => {
    const updatedCourses = {
      ...storedCourses,
      [semesterId]: storedCourses[semesterId]?.filter((_, i) => i !== index) || []
    };
    setStoredCourses(updatedCourses);
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
      credits: course.credits,
      geneds: course.geneds || []
    });
    setSuggestions([]);
  };

  return (
    <main className="container mx-auto p-4 md:p-8 flex flex-col gap-4 items-start w-full">
      <div className="flex gap-4 items-center">
        <Label>Starting Semester</Label>
        <Select 
          value={startSemester} 
          onValueChange={(value) => handleSemesterChange("start", value)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select a Semester" />
          </SelectTrigger>
          <SelectContent className="max-h-60 overflow-y-auto">
            {semesterOptions.map((option) => (
              <SelectItem 
                key={option.value} 
                value={option.value}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Label>Graduation Semester</Label>
        <Select 
          value={endSemester} 
          onValueChange={(value) => handleSemesterChange("end", value)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select a Semester" />
          </SelectTrigger>
          <SelectContent className="max-h-60 overflow-y-auto">
            {semesterOptions.map((option) => (
              <SelectItem 
                key={option.value} 
                value={option.value}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center space-x-2">
          <Switch
            id="show-transfer"
            checked={showTransfer}
            onCheckedChange={setShowTransfer}
          />
          <Label htmlFor="show-transfer">Show Transfer Credits</Label>
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            id="show-all-semesters"
            checked={showAllSemesters}
            onCheckedChange={setShowAllSemesters}
          />
          <Label htmlFor="show-all-semesters">Show Winter/Summer Semesters</Label>
        </div>
      </div>

      <div className="w-full mt-8">
        <h2 className="text-2xl font-semibold mb-4">Your Schedule</h2>
        <SemesterDisplay 
          semesters={semesters} 
          onAddCourse={(semesterId) => {
            setSelectedSemesterId(semesterId);
            setShowAddCourse(true);
          }}
          onRemoveCourse={handleRemoveCourse}
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
              <Label htmlFor="code">Course Code/Placeholder</Label>
              <div className="relative">
                <div className="relative">
                  
                  <Input
                    id="code"
                    value={newCourse.code}
                    onChange={(e) => handleCourseCodeChange(e.target.value)}
                    placeholder="e.g. CMSC131, DVCC, SCIS"
                  />
                  
                </div>
                {isLoading && (
                  <div className="absolute right-2 top-2">
                    <div
  className="animate-spin rounded-full h-4 w-4 border-b-2"
  style={{ borderBottomColor: '#e03131' }}
></div>
                  </div>
                )}
                {suggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg">
                    <div className="max-h-60 overflow-y-auto">
                      {suggestions.map((course) => (
                        <div
                          key={course.code}
                          className="px-4 py-2 cursor-pointer hover:bg-gray-50"
                          onClick={() => handleSuggestionClick(course)}
                        >
                          <div className="font-medium text-black font-bold">{course.code}</div>
                          <div className="text-sm text-gray-600">{course.name}</div>
                          <div className="text-xs text-gray-500">{course.credits} credits</div>
                        </div>
                      ))}
                    </div>
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
