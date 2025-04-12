import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

export default function Page() {
  return (
    <main className="flex flex-col gap-4 items-start">
      <p>Debug page</p>
      <Input className="max-w-sm" />
      <form>
        <Button type="submit">Test</Button>
      </form>
    </main>
  );
}
