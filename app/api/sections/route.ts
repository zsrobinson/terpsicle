import { NextResponse } from "next/server";
import { scrapeSections } from "~/lib/scrape-section";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dept = searchParams.get("dept");

  if (!dept) {
    return NextResponse.json(
      { error: "Department code is required" },
      { status: 400 }
    );
  }

  try {
    const courses = await scrapeSections(dept);
    return NextResponse.json(courses);
  } catch (error) {
    console.error("Failed to fetch courses:", error);
    return NextResponse.json(
      { error: "Failed to fetch courses" },
      { status: 500 }
    );
  }
}
