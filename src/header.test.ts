import { describe, expect, test } from "vitest";
import { formatHeaderLabel } from "./header";

describe("formatHeaderLabel", () => {
	test("path style shows the full vault path", () => {
		expect(formatHeaderLabel("a/b/X.abap", null, "path")).toBe("a/b/X.abap");
	});

	test("filename style shows only the basename", () => {
		expect(formatHeaderLabel("a/b/X.abap", null, "filename")).toBe("X.abap");
	});

	test("appends a single-line range", () => {
		expect(
			formatHeaderLabel("a/X.abap", { start: 10, end: 10 }, "path"),
		).toBe("a/X.abap:10");
	});

	test("appends a multi-line range", () => {
		expect(
			formatHeaderLabel("a/X.abap", { start: 10, end: 25 }, "filename"),
		).toBe("X.abap:10-25");
	});

	test("range with no end behaves like a single line", () => {
		expect(formatHeaderLabel("X.abap", { start: 7 }, "path")).toBe(
			"X.abap:7",
		);
	});

	test("unknown style falls back to the full path", () => {
		expect(
			formatHeaderLabel("a/b/X.abap", null, "weird" as never),
		).toBe("a/b/X.abap");
	});
});
