import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeResult, MeUser } from "~/core/schema";
import { api } from "~/server/fns/api";
import { Toaster } from "~/ui/sonner";
import { TooltipProvider } from "~/ui/tooltip";
import { AccountButton } from "./account-button";
import {
  type AccountClient,
  FLAGS_OFF,
  setAccountClient,
  useAccount,
} from "./account-store";
import { initials } from "./avatar";
import { GOOGLE_PROFILE_URL, SettingsPage } from "./settings-account";
import { SignInPage } from "./signin-page";
import { TestSignInPage } from "./test-sign-in-page";

const USER: MeUser = {
  id: "testudo",
  name: "Testudo Terrapin",
  email: "testudo@terpmail.umd.edu",
  avatarUrl: "/avatars/testudo/0123456789abcdef.png",
  isAdmin: false,
  createdAt: "2026-10-01T15:00:00.000Z",
};

const flags = (on: { signIn: boolean; authTestMode?: boolean }) => ({
  ...FLAGS_OFF,
  ...on,
});

const signedIn = (user: MeUser = USER): MeResult => ({
  status: "signed-in",
  flags: flags({ signIn: true }),
  user,
  pushPublicKey: null,
});

function fakeClient(me: MeResult) {
  const client = {
    me: vi.fn(async () => me),
    auth: {
      signOut: vi.fn(async () => ({ status: "signed-out" as const })),
      testSignIn: vi.fn(),
    },
    account: {
      delete: vi.fn(async () => ({
        status: "deleting" as const,
        deleteAfter: "2026-10-08T15:00:00.000Z",
      })),
    },
  };
  setAccountClient(client as unknown as AccountClient);
  return client;
}

const wrap = (node: ReactNode) =>
  render(
    <TooltipProvider delayDuration={0}>
      {node}
      <Toaster />
    </TooltipProvider>,
  );

async function loaded(me: MeResult) {
  const client = fakeClient(me);
  await useAccount.getState().load();
  return client;
}

beforeEach(() => {
  useAccount.setState({
    status: "loading",
    flags: FLAGS_OFF,
    user: null,
    deleteAfter: null,
  });
});
afterEach(() => setAccountClient(api));

describe("the top bar's account button", () => {
  it("shows nothing while loading, or where signing in is off", async () => {
    wrap(<AccountButton />);
    expect(screen.queryByRole("button")).toBeNull();
    await loaded({
      status: "signed-out",
      flags: flags({ signIn: false }),
    });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("invites signing in, with Google, back to this page", async () => {
    await loaded({
      status: "signed-out",
      flags: flags({ signIn: true }),
    });
    window.history.replaceState(null, "", "/schedule?plan=abc");
    const user = userEvent.setup();
    wrap(<AccountButton />);
    const button = screen.getByRole("button", { name: "Sign in" });
    await user.hover(button);
    expect(
      await screen.findByRole("tooltip", {
        name: "Sign in to join your class chats. Your plans sync too.",
      }),
    ).toBeInTheDocument();
    await user.click(button);
    const dialog = await screen.findByRole("dialog");
    const google = within(dialog).getByRole("link", {
      name: "Sign in with Google",
    });
    expect(google).toHaveAttribute(
      "href",
      "/api/auth/google?return=%2Fschedule%3Fplan%3Dabc",
    );
  });

  it("says test mode, and leads to /auth/test instead of Google", async () => {
    await loaded({
      status: "signed-out",
      flags: flags({ signIn: true, authTestMode: true }),
    });
    window.history.replaceState(null, "", "/schedule");
    const user = userEvent.setup();
    wrap(<AccountButton />);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("link", { name: "Sign in (test mode)" }),
    ).toHaveAttribute("href", "/api/auth/google?return=%2Fschedule");
    expect(within(dialog).queryByRole("img")).toBeNull();
  });

  it("opens a menu with the name, email, Settings and Sign out", async () => {
    const client = await loaded(signedIn());
    const user = userEvent.setup();
    wrap(<AccountButton />);
    await user.click(
      screen.getByRole("button", { name: "Account: Testudo Terrapin" }),
    );
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("Testudo Terrapin")).toBeInTheDocument();
    expect(
      within(menu).getByText("testudo@terpmail.umd.edu"),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "Settings" }),
    ).toHaveAttribute("href", "/settings");
    expect(within(menu).queryByRole("menuitem", { name: "Admin" })).toBeNull();
    await user.click(within(menu).getByRole("menuitem", { name: "Sign out" }));
    expect(client.auth.signOut).toHaveBeenCalledWith({ removeLocal: false });
    expect(
      await screen.findByRole("button", { name: "Sign in" }),
    ).toBeInTheDocument();
  });

  it("on phones, stands in for the theme toggle only once sign-in is on", async () => {
    const toggle = <button type="button">Theme</button>;
    const { rerender } = wrap(<AccountButton compact themeToggle={toggle} />);
    expect(screen.getByRole("button", { name: "Theme" })).toBeInTheDocument();

    await loaded({ status: "signed-out", flags: flags({ signIn: true }) });
    rerender(
      <TooltipProvider delayDuration={0}>
        <AccountButton compact themeToggle={toggle} />
      </TooltipProvider>,
    );
    expect(screen.queryByRole("button", { name: "Theme" })).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: "Sign in with Google" }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/api\/auth\/google\?return=/),
    );
    expect(
      within(menu).getByRole("menuitemradio", { name: "Dark" }),
    ).toBeInTheDocument();
  });

  it("links admins to /admin", async () => {
    await loaded(signedIn({ ...USER, isAdmin: true }));
    const user = userEvent.setup();
    wrap(<AccountButton />);
    await user.click(screen.getByRole("button", { name: /^Account/ }));
    expect(
      await screen.findByRole("menuitem", { name: "Admin" }),
    ).toHaveAttribute("href", "/admin");
  });
});

describe("/settings", () => {
  it("shows the Google profile read-only, with where to change it", async () => {
    await loaded(signedIn());
    wrap(<SettingsPage />);
    expect(screen.getByText("Testudo Terrapin")).toBeInTheDocument();
    expect(screen.getByText("testudo@terpmail.umd.edu")).toBeInTheDocument();
    expect(screen.getByText("testudo")).toBeInTheDocument();
    expect(
      screen.getByText(/Your name and photo come from your Google account/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Google Account/ }),
    ).toHaveAttribute("href", GOOGLE_PROFILE_URL);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("deletes without a dialog, and offers Undo (signing back in)", async () => {
    const client = await loaded(signedIn());
    const user = userEvent.setup();
    wrap(<SettingsPage />);
    await user.click(screen.getByRole("button", { name: "Delete account" }));
    expect(client.account.delete).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(
      await screen.findByText(/Your account will be deleted on .*October 8/),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Undo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Sign in with Google" }),
    ).toHaveAttribute("href", "/api/auth/google?return=%2Fsettings");
  });

  it("invites signing in when signed out", async () => {
    await loaded({
      status: "signed-out",
      flags: flags({ signIn: true }),
    });
    wrap(<SettingsPage />);
    expect(screen.getByText("You're not signed in.")).toBeInTheDocument();
  });
});

describe("/signin", () => {
  it("says what went wrong, plainly, and offers another try", async () => {
    await loaded({
      status: "signed-out",
      flags: flags({ signIn: true }),
    });
    wrap(<SignInPage error="personal-account" returnTo="/chat" />);
    expect(
      screen.getByText(
        "That's a personal Google account. Choose your @terpmail.umd.edu or @umd.edu account.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Sign in with Google" }),
    ).toHaveAttribute("href", "/api/auth/google?return=%2Fchat");
    expect(
      screen.getByRole("link", { name: "Back to Terpsicle" }),
    ).toHaveAttribute("href", "/chat");
  });

  it("never links back off the site", async () => {
    await loaded({
      status: "signed-out",
      flags: flags({ signIn: true }),
    });
    wrap(<SignInPage error="expired" returnTo="https://evil.example" />);
    expect(
      screen.getByRole("link", { name: "Back to Terpsicle" }),
    ).toHaveAttribute("href", "/");
  });
});

describe("/auth/test", () => {
  it("lists the test people, and only in test mode", async () => {
    await loaded({
      status: "signed-out",
      flags: flags({ signIn: true, authTestMode: true }),
    });
    const { unmount } = wrap(<TestSignInPage returnTo="/settings" />);
    expect(
      screen
        .getAllByRole("button")
        .filter((b) => b.textContent?.startsWith("Sign in as"))
        .map((b) => b.textContent),
    ).toEqual([
      "Sign in as Test Student",
      "Sign in as Test Classmate",
      "Sign in as Test Admin",
    ]);
    unmount();

    await loaded({ status: "signed-out", flags: flags({ signIn: true }) });
    wrap(<TestSignInPage returnTo="/settings" />);
    expect(
      screen.getByText("Test sign-in is only on test copies of Terpsicle."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sign in as/ })).toBeNull();
  });
});

describe("initials", () => {
  it("takes the first and last words", () => {
    expect(initials("Testudo Terrapin")).toBe("TT");
    expect(initials("Testudo T. Terrapin")).toBe("TT");
    expect(initials("testudo")).toBe("T");
    expect(initials("  ")).toBe("");
  });
});
