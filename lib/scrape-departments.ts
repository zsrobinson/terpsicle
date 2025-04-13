import { JSDOM } from "jsdom";

const TERM = "202508";
const REVALIDATE = 600;

export async function scrapeDepartments() {
  const url = `https://app.testudo.umd.edu/soc/${TERM}`;
  const res = await fetch(url, { next: { revalidate: REVALIDATE } });
  const text = await res.text();
  const doc = new JSDOM(text).window.document;

  const depts = Array.from(
    doc.querySelectorAll(".prefix-abbrev.push_one.two.columns")
  ).map((el) => el.innerHTML);

  return depts;
}
