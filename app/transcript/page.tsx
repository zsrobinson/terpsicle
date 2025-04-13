"use client";

import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { TranscriptParser } from "~/lib/transcript-parser";
import { useRouter } from "next/navigation";
import { Course } from "~/lib/types";
import { useLocalStorage } from "~/lib/use-local-storage";

export default function TranscriptPage() {
  const [transcriptText, setTranscriptText] = useState<string>("");
  const [parsedCourses, setParsedCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("paste");
  const router = useRouter();
  
  // Create a localStorage key to store courses by semester
  const [, setStoredCoursesBySemester] = useLocalStorage<{[semesterId: string]: Course[]}>('semester-courses', {});

  const handleParseTranscript = () => {
    if (!transcriptText.trim()) {
      setError("Please paste your transcript text");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log("Starting transcript parsing...");
      
      // Simple case to try parsing - let's create a sample course
      if (transcriptText.includes("DEBUG_MODE")) {
        // Create a sample parsed course for debugging
        const debugCourses: Course[] = [
          {
            code: "CMSC132",
            name: "Object-Oriented Programming II",
            credits: 4,
            semester: "202308",
            geneds: [[]],
            crosslist: []
          },
          {
            code: "Transfer",
            name: "CALCULUS BC",
            credits: 4,
            semester: "Transfer",
            geneds: [["FSAR", "FSMA"]],
            crosslist: ["MATH140"]
          }
        ];
        
        console.log("Debug mode activated, using sample courses");
        storeParsedCourses(debugCourses);
        setIsLoading(false);
        return;
      }
      
      const courses = TranscriptParser(transcriptText);
      console.log("Parsing complete. Courses found:", courses.length);
      
      if (courses.length > 0) {
        storeParsedCourses(courses);
      } else {
        setError("No courses found in the transcript. Please check your input.");
        setIsLoading(false);
      }
    } catch (err) {
      console.error("Error parsing transcript:", err);
      setError(`Failed to parse transcript: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setIsLoading(false);
    }
  };

  // Store courses both in state and localStorage, properly organized by semester
  const storeParsedCourses = (courses: Course[]) => {
    setParsedCourses(courses);
    
    // Group courses by semester
    const coursesBySemester: {[semesterId: string]: Course[]} = {};
    
    courses.forEach(course => {
      const semesterId = course.semester || "Transfer";
      
      if (!coursesBySemester[semesterId]) {
        coursesBySemester[semesterId] = [];
      }
      
      coursesBySemester[semesterId].push(course);
    });
    
    console.log("Storing courses by semester:", coursesBySemester);
    
    // Store in localStorage
    setStoredCoursesBySemester(coursesBySemester);
    
    // Switch to results tab
    setActiveTab("results");
    setIsLoading(false);
  };

  const handleDebugMode = () => {
    // Set transcript text to include DEBUG_MODE flag
    setTranscriptText(prev => prev + "\n\nDEBUG_MODE");
    setError("Debug mode activated. Click 'Parse Transcript' to test with sample data.");
  };

  const handleContinue = () => {
    if (parsedCourses.length > 0) {
      // Navigate to degree page
      router.push("/degree");
    }
  };

  return (
    <main className="container mx-auto px-4 py-12 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6 text-center">Import Your Transcript</h1>
      
      <div className="mb-6 text-center text-muted-foreground">
        <p>
          Paste your UMD unofficial transcript below to automatically import your courses.
          This helps us personalize your degree planning experience.
        </p>
      </div>

      <div className="bg-card rounded-lg border shadow-sm p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="paste" className="flex-1">Paste Transcript</TabsTrigger>
            <TabsTrigger value="results" className="flex-1" disabled={parsedCourses.length === 0}>
              Review Results ({parsedCourses.length})
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="paste" className="space-y-4">
            <div className="space-y-2">
              <textarea
                placeholder="Paste your unofficial transcript from Testudo here..."
                className="w-full h-96 p-4 border rounded-md font-mono resize-none bg-muted"
                value={transcriptText}
                onChange={(e) => setTranscriptText(e.target.value)}
              />
              {error && <p className="text-destructive text-sm">{error}</p>}
            </div>
            
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline"
                onClick={handleDebugMode}
                className="min-w-32"
              >
                Debug Mode
              </Button>
              <Button 
                onClick={handleParseTranscript} 
                disabled={isLoading}
                className="min-w-32"
              >
                {isLoading ? "Processing..." : "Parse Transcript"}
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="results">
            <div className="space-y-4">
              <div className="bg-muted rounded-md p-4">
                <h3 className="font-semibold mb-2">Courses Found: {parsedCourses.length}</h3>
                
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {parsedCourses.map((course, index) => (
                    <div key={index} className="flex items-center justify-between p-2 border-b">
                      <div>
                        <span className="font-mono">{course.code}</span>
                        <span className="ml-2 text-muted-foreground">{course.name}</span>
                      </div>
                      <div className="flex items-center">
                        <span className="mr-2">{course.credits} credits</span>
                        {course.geneds && course.geneds.length > 0 && course.geneds[0].length > 0 && (
                          <span className="bg-secondary text-sm px-2 py-1 rounded-full">
                            {course.geneds.map(gened => gened.join("/")).join(", ")}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {parsedCourses.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">No courses found</p>
                  )}
                </div>
              </div>
              
              <div className="flex justify-end">
                <Button onClick={handleContinue}>
                  Continue to Planning
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
      
      <div className="mt-8 text-sm text-center text-muted-foreground">
        <p>
          Your transcript data is processed locally and never leaves your browser.
          We use it only to help you plan your academic journey.
        </p>
      </div>
    </main>
  );
}