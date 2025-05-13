import { NextResponse } from "next/server";
import { scrapeTerms } from "~/lib/scrape-terms";

export async function GET() {
  try {
    const terms = await scrapeTerms();
    return NextResponse.json(terms);
  } catch (e) {
    console.error("Failed to fetch courses:", e);
    return NextResponse.json(
      { error: "Failed to fetch terms" },
      { status: 500 }
    );
  }
}
