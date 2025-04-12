"use client";

import { useEffect, useState } from "react";
import { Course } from "~/lib/types";
import { useLocalStorage } from "~/lib/use-local-storage";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

export default function StorageTestPage() {
  const [storedCourses] = useLocalStorage<{[semesterId: string]: Course[]}>('semester-courses', {});

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Local Storage Test</h1>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Courses from Local Storage</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-gray-100 p-4 rounded-lg overflow-auto">
              {JSON.stringify(storedCourses, null, 2)}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Storage Info</CardTitle>
          </CardHeader>
          <CardContent>
            <p><strong>Key:</strong> semester-courses</p>
            <p><strong>Number of Semesters:</strong> {Object.keys(storedCourses).length}</p>
            <p><strong>Total Courses:</strong> {Object.values(storedCourses).reduce((total, courses) => total + courses.length, 0)}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
