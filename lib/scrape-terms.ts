import { JSDOM } from "jsdom";
import { Term } from "./types";

export async function scrapeTerms(): Promise<Term[]> {
  const res = await fetch("https://app.testudo.umd.edu/soc/");
  const text = await res.text();
  const doc = new JSDOM(text).window.document;

  return [...doc.querySelectorAll("select#term-id-input > option")].map(
    (el) => ({
      value: (el as HTMLOptionElement).value,
      name: (el as HTMLOptionElement).textContent ?? "",
    })
  );
}
