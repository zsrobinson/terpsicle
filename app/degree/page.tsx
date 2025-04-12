import { Label } from "~/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "~/components/ui/select";

export default function Page() {
  return (
    <main className="flex flex-col gap-4 items-start">
      <div className="flex gap-4">
        <Label>Graduation</Label>
        <Select defaultValue="202701">
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select a Semester" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="202501">Spring 2025</SelectItem>
            <SelectItem value="202508">Fall 2025</SelectItem>
            <SelectItem value="202601">Spring 2026</SelectItem>
            <SelectItem value="202608">Fall 2026</SelectItem>
            <SelectItem value="202701">Spring 2027</SelectItem>
            <SelectItem value="202708">Fall 2027</SelectItem>
          </SelectContent>
        </Select>

        <Label>Track</Label>
        <Select defaultValue="general">
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select a Track" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="general">General Track</SelectItem>
            <SelectItem value="cyber">Cybersecurity</SelectItem>
            <SelectItem value="data">Data Science</SelectItem>
            <SelectItem value="quantum">Quantum Information</SelectItem>
            <SelectItem value="ml">Machine Learning</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </main>
  );
}
