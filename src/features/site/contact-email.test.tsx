import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "~/ui/tooltip";
import {
  ContactEmail,
  contactEmailAddress,
  contactEmailText,
} from "./contact-email";
import source from "./contact-email.tsx?raw";

const ADDRESS = ["admin", "terpsicle.com"].join("@");

describe("contact email", () => {
  it("builds the address only at runtime", () => {
    expect(contactEmailAddress()).toBe(ADDRESS);
    expect(contactEmailText()).toBe("admin [at] terpsicle.com");
    expect(source).not.toContain(ADDRESS);
    expect(source).not.toContain("terpsicle.com");
  });

  it("renders the address in words, never whole in the page", () => {
    const { container } = render(
      <TooltipProvider>
        <ContactEmail />
      </TooltipProvider>,
    );
    expect(screen.getByText("admin [at] terpsicle.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Email us" })).toBeVisible();
    expect(container.innerHTML).not.toContain(ADDRESS);
    expect(container.querySelector("a[href^='mailto:']")).toBeNull();
  });
});
