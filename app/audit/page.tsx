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
      <h2 className="text-2xl font-semibold mt-4 ml-8 text-left">
        Degree Audit
      </h2>

      {/* Wrapper with horizontal padding */}
      <div className="px-4 md:px-6">
        {/* Flex container for two-column layout */}
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-full md:min-w-[43%]">
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
          </div>

          <div className="flex-1 min-w-full md:min-w-[48%]">
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
          </div>

          <div className="flex-1 min-w-full md:min-w-[48%]">
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
          </div>

          <div className="flex-1 min-w-full md:min-w-[48%]">
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
          </div>
        </div>
      </div>
    </main>
  );
}
