import { describe, expect, it } from "vitest";

import { escapeCsvField, toCsvRow } from "./csv.js";

describe("csv", () => {
  it("escapes commas, quotes, and newlines", () => {
    expect(escapeCsvField("plain")).toBe("plain");
    expect(escapeCsvField('say "hello"')).toBe('"say ""hello"""');
    expect(escapeCsvField("a,b")).toBe('"a,b"');
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });

  it("builds a valid row", () => {
    expect(toCsvRow(["front", "back", "concept"])).toBe(
      "front,back,concept",
    );
    expect(toCsvRow(['front, "q"', "back", ""])).toBe(
      '"front, ""q""",back,',
    );
  });
});
