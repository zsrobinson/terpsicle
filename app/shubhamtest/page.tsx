import { scrapeDepartment } from "~/lib/scrape-department";

export default function Page() {
    const output = scrapeDepartment("PLCY");
    return (
      <main className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Terpsicle</h1>
        <p>Lorem ipsum dolor sit amet</p>
      </main>
    );
  }
  