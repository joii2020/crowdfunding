import { Since } from "@ckb-ccc/core";
import { sinceFromDate, sinceToDate } from "shared";

describe("since utils", () => {
  test("converts date to since and back", () => {
    const date = new Date("2024-01-02T03:04:05Z");
    const back = sinceToDate(sinceFromDate(date));
    expect(back.toISOString()).toBe(date.toISOString());
  });

  test("throws when since is not absolute timestamp", () => {
    const relativeTimestamp = new Since("relative", "timestamp", 0n);

    expect(() => sinceToDate(relativeTimestamp)).toThrow(
      /absolute timestamp/,
    );
  });
});
