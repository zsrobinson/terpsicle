// Worker test project setup: bring the in-memory D1 up to the committed
// migrations before each test file.
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { testBindings } from "./test-bindings";

await applyD1Migrations(env.DB, testBindings().migrations);
