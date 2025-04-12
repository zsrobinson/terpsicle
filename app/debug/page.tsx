import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { scrapeDepartment } from "~/lib/scrape-department";

export default async function Page() {
  const data = await scrapeDepartment("CMSC");
  console.log(data);

  return (
    <main className="flex flex-col gap-4 items-start">
      <p>Debug page</p>
      <Input className="max-w-sm" />
      <form>
        <Button type="submit">Test</Button>
      </form>

      <pre>
        <code>{JSON.stringify(data, null, 2)}</code>
      </pre>
    </main>
  );
}
