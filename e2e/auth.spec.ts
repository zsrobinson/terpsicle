import { expect, type Page, test } from "@playwright/test";

// Identity in test mode (docs/AUTH.md, V2.md §4.6): `pnpm dev:mock` runs the
// Worker with AUTH_TEST_MODE on localhost, so "Sign in" leads to /auth/test's
// fixture people instead of Google. Everything after that is the real code:
// the session cookie, POST /api/me, the account menu, sign-out, /settings.

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function open(page: Page, path = "/") {
  await page.goto(path);
  await expect(page.getByRole("img", { name: "Terpsicle" })).toBeVisible();
}

const signInButton = (page: Page) =>
  page.getByRole("banner").getByRole("button", { name: "Sign in" });
const accountButton = (page: Page, name: string) =>
  page.getByRole("banner").getByRole("button", { name: `Account: ${name}` });

async function sessionCookie(page: Page) {
  const cookies = await page.context().cookies();
  return cookies.find((c) => c.name === "__Host-session");
}

test("sign in as a test person, see the account menu, and sign out", async ({
  page,
  isMobile,
}) => {
  await open(page);
  // Signed out, Terpsicle sets no cookie at all.
  expect(await page.context().cookies()).toEqual([]);

  await signInButton(page).click();
  // A sheet on desktop; on phones, one menu holds sign-in and the theme.
  const sheet = page.getByRole(isMobile ? "menu" : "dialog");
  await expect(
    sheet.getByText("Sign in to join your class chats. Your plans sync too."),
  ).toBeVisible();
  if (isMobile)
    await expect(
      sheet.getByRole("menuitemradio", { name: "Dark" }),
    ).toBeVisible();
  await sheet
    .getByRole(isMobile ? "menuitem" : "link", { name: "Sign in (test mode)" })
    .click();

  await expect(page).toHaveURL(/\/auth\/test\?return=%2F$/);
  await expect(
    page.getByRole("heading", { name: "Test sign-in" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign in as Test Student" }).click();

  // Back where we were, signed in, with ?signed-in=1 already stripped.
  await expect(accountButton(page, "Test Student")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  expect(await sessionCookie(page)).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
  });

  await accountButton(page, "Test Student").click();
  const menu = page.getByRole("menu");
  await expect(menu.getByText("tstudent@terpmail.umd.edu")).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Settings" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Admin" })).toHaveCount(0);
  await menu.getByRole("menuitem", { name: "Sign out" }).click();

  await expect(signInButton(page)).toBeVisible();
  expect(await sessionCookie(page)).toBeUndefined();
  // Still signed out after a reload: the session is gone on the server too.
  await open(page);
  await expect(signInButton(page)).toBeVisible();
});

test("settings shows the profile read-only; the test admin gets Admin", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "the same page on phones; the flow above covers them");
  await open(page, "/auth/test?return=%2Fsettings");
  await page.getByRole("button", { name: "Sign in as Test Admin" }).click();

  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("tadmin@terpmail.umd.edu")).toBeVisible();
  await expect(
    page.getByText(/Your name and photo come from your Google account/),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Google Account/ }),
  ).toHaveAttribute("href", "https://myaccount.google.com/personal-info");

  await open(page);
  await accountButton(page, "Test Admin").click();
  await expect(
    page.getByRole("menu").getByRole("menuitem", { name: "Admin" }),
  ).toBeVisible();
});

test("a sign-in error lands on /signin with plain words", async ({ page }) => {
  await open(page, "/signin?error=personal-account&return=%2F");
  await expect(
    page.getByText(
      "That's a personal Google account. Choose your @terpmail.umd.edu or @umd.edu account.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to Terpsicle" }),
  ).toHaveAttribute("href", "/");
});
