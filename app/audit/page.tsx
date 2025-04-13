import { Course } from "~/lib/types";
import { Requirement } from "~/lib/types";
import { GenEdBody } from "./tablerows";
import { LowerLevelBody } from "./tablerows";
import { UpperLevelConcentrationBody } from "./tablerows";
import { UpperLevelBody } from "./tablerows";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

export default async function Page() {
  return (
    <main className="flex flex-col gap-4">
      <h3>Degree Audit</h3> {/*Want to make this bigger*/}
      <Card>
        <CardHeader>
          <CardTitle>General Education</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Gen Ed Code</TableHead>
                <TableHead>Needed Credits</TableHead>
                <TableHead>Fulfilled Credits</TableHead>
                <TableHead>Course(s)</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <GenEdBody />
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Lower Level CS Requirements</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Class Code</TableHead>
                <TableHead>Needed Credits</TableHead>
                <TableHead>Fulfilled Credits</TableHead>
                <TableHead>Course(s)</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <LowerLevelBody />
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Upper Level Track Requirements</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Area</TableHead>
                <TableHead>Needed Credits</TableHead>
                <TableHead>Fulfilled Credits</TableHead>
                <TableHead>Course(s)</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <UpperLevelBody />
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Upper Level Concentration</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Area</TableHead>
                <TableHead>Needed Credits</TableHead>
                <TableHead>Fulfilled Credits</TableHead>
                <TableHead>Course(s)</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <UpperLevelConcentrationBody />
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
