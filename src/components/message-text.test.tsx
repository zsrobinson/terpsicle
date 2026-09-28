import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageText } from "./message-text";

describe("MessageText", () => {
  it("sets codes in mono and numbers in the sentence's font with tabular figures", () => {
    const { container } = render(
      <p>
        <MessageText
          message={[
            { kind: "course", courseCode: "CMSC330" },
            { kind: "text", text: ": " },
            { kind: "duration", minutes: 18 },
            { kind: "text", text: " to get there, from " },
            { kind: "time", minutes: 650 },
          ]}
        />
      </p>,
    );
    expect(container).toHaveTextContent(
      "CMSC330: 18 min to get there, from 10:50am",
    );
    const mono = [...container.querySelectorAll(".font-mono")].map(
      (e) => e.textContent,
    );
    expect(mono).toEqual(["CMSC330"]);
    const tnum = [...container.querySelectorAll(".tnum")].map(
      (e) => e.textContent,
    );
    expect(tnum).toEqual(["18 min", "10:50am"]);
  });
});
