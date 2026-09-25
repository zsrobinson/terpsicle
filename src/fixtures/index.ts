// Mock data for `pnpm dev:mock`, unit tests and e2e. See README.md.
export * from "./builders";
export {
  CANCELLED_SECTION_KEY,
  MOVED_SECTION_KEY,
  mockCatalog,
  mockCourse,
  mockCourses,
  mockDepartmentNames,
  mockSection,
  removedSections,
} from "./mock/catalog";
export {
  cancelledSectionBefore,
  mockChanges,
  movedSectionBefore,
} from "./mock/changes";
export {
  buildMockDataFiles,
  type MockDataFiles,
  mockDataSource,
} from "./mock/data-source";
export {
  ESTIMATE_ACCESSIBLE_RATIO,
  ESTIMATE_DETOUR,
  encodeMockRoutes,
  mockBuildingsFile,
  mockDistanceFeet,
  mockRouteGeometries,
  mockRoutesIndex,
  NO_ACCESSIBLE_ROUTE,
} from "./mock/geo";
export {
  MOCK_GRADES_THROUGH,
  mockInstructorSlugs,
  mockInstructors,
  mockPlanetTerpDepts,
  mockReviewSummaries,
} from "./mock/planetterp";
export {
  demoArchivedPlan,
  demoBlocks,
  demoCourseColors,
  demoPlan,
  demoPlanB,
  demoPlans,
} from "./mock/plans";
export {
  MOCK_SEATS_AS_OF,
  MOCK_SEATS_FETCHED_AT,
  mockArchivedSeats,
  mockSeats,
  PINNED_SEATS,
  UNKNOWN_SEATS,
} from "./mock/seats";
export { mockCalendars, mockTermsFile } from "./mock/terms";
export { hashString, randomInt, seededRandom } from "./random";
export { median, medianMs } from "./timing";
