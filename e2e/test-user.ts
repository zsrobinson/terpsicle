import { expect, type Page } from "@playwright/test";

/** A separate server-side identity for every test, including retries. */
export const newTestUserId = () =>
  `e2e${crypto.randomUUID().replaceAll("-", "").slice(0, 13)}`;

export async function signInNewUser(
  page: Page,
  path: string,
  userId = newTestUserId(),
): Promise<string> {
  await page.goto("/privacy");
  const next = await page.evaluate(
    async ({ userId, path }) => {
      const response = await fetch("/api/auth/test-sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, return: path }),
      });
      if (!response.ok) throw new Error(`Test sign-in: ${response.status}`);
      const result: { return?: string } = await response.json();
      return result.return;
    },
    { userId, path },
  );
  expect(next).toBeTruthy();
  await page.goto(next ?? path);
  // The account menu appears after /api/me; links are hydrated by then.
  await expect(
    page.getByRole("banner").getByRole("button", {
      name: `Account: E2E ${userId.slice(3)}`,
      exact: true,
    }),
  ).toBeVisible();
  return userId;
}
