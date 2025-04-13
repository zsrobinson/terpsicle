import { NextResponse } from "next/server";
import { Course } from "~/lib/types";
import { scrapeCourses } from "~/lib/scrape-courses";
import { getCachedData, setCachedData } from "~/lib/cache";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dept = searchParams.get("dept");

  const placeholders: Course[] = [
    {
      code: "FSAW",
      credits: 3,
      name: "Placeholder for a FSAW course",
      geneds: [["FSAW"]],
    },
    {
      code: "FSAR",
      credits: 3,
      name: "Placeholder for a FSAR course",
      geneds: [["FSAR"]],
    },
    {
      code: "FSMA",
      credits: 3,
      name: "Placeholder for a FSMA course",
      geneds: [["FSMA"]],
    },
    {
      code: "FSOC",
      credits: 3,
      name: "Placeholder for a FSOC course",
      geneds: [["FSOC"]],
    },
    {
      code: "FSPW",
      credits: 3,
      name: "Placeholder for a FSPW course",
      geneds: [["FSPW"]],
    },
    {
      code: "DSHS",
      credits: 3,
      name: "Placeholder for a DSHS course",
      geneds: [["DSHS"]],
    },
    {
      code: "DSHU",
      credits: 3,
      name: "Placeholder for a DSHU course",
      geneds: [["DSHU"]],
    },
    {
      code: "DSNS",
      credits: 3,
      name: "Placeholder for a DSNS course",
      geneds: [["DSNS"]],
    },
    {
      code: "DSNL",
      credits: 3,
      name: "Placeholder for a DSNL course",
      geneds: [["DSNL"]],
    },
    {
      code: "DSSP",
      credits: 3,
      name: "Placeholder for a DSSP course",
      geneds: [["DSSP"]],
    },
    {
      code: "DVCC",
      credits: 3,
      name: "Placeholder for a DVCC course",
      geneds: [["DVCC"]],
    },
    {
      code: "DVUP",
      credits: 3,
      name: "Placeholder for a DVUP course",
      geneds: [["DVUP"]],
    },
    {
      code: "SCIS",
      credits: 3,
      name: "Placeholder for a SCIS course",
      geneds: [["SCIS"]],
    },
  ];

  if (!dept) {
    return NextResponse.json(
      { error: "Department code is required" },
      { status: 400 }
    );
  }

  try {
    // Check cache first
    const cachedData = getCachedData(dept);
    if (cachedData) {
      return NextResponse.json([...cachedData, ...placeholders]);
    }

    // If not in cache, fetch and cache the data
    const courses = await scrapeCourses(dept);
    setCachedData(dept, courses);
    return NextResponse.json([...courses, ...placeholders]);
  } catch (error) {
    console.error("Failed to fetch courses:", error);
    return NextResponse.json(
      { error: "Failed to fetch courses" },
      { status: 500 }
    );
  }
}
