import { NextResponse } from "next/server";
import { scrapeSections } from "~/app/schedule/fetch";
import { JSDOM } from "jsdom";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dept = searchParams.get("dept");

  if (!dept) {
    return NextResponse.json(
      { error: "Department code is required" },
      { status: 400 }
    );
  }

  await new Promise((res) => setTimeout(res, 1000));

  try {
    const dom = JSDOM;
    const courses = await scrapeSections({ course_id: dept }, dom);
    return NextResponse.json(courses);
  } catch (error) {
    console.error("Failed to fetch courses:", error);
    return NextResponse.json(
      { error: "Failed to fetch courses" },
      { status: 500 }
    );
  }
}
