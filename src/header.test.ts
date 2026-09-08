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

	describe("relative style", () => {
		test("source below the note's folder drops the shared prefix", () => {
			expect(
				formatHeaderLabel("docs/examples/demo.ts", null, "relative", "docs/setup.md"),
			).toBe("examples/demo.ts");
		});

		test("source in the same folder shows only the filename", () => {
			expect(
				formatHeaderLabel("docs/demo.ts", null, "relative", "docs/setup.md"),
			).toBe("demo.ts");
		});

		test("source outside the note's subtree climbs with ../", () => {
			expect(
				formatHeaderLabel("assets/demo.ts", null, "relative", "docs/setup.md"),
			).toBe("../assets/demo.ts");
		});

		test("climbs one level per folder between note and common ancestor", () => {
			expect(
				formatHeaderLabel("a/x/demo.ts", null, "relative", "a/b/c/note.md"),
			).toBe("../../x/demo.ts");
		});

		test("note at the vault root shows the plain vault path", () => {
			expect(
				formatHeaderLabel("docs/demo.ts", null, "relative", "setup.md"),
			).toBe("docs/demo.ts");
		});

		test("does not treat a folder-name prefix as a shared folder", () => {
			// "docs" vs "docs2" share characters, not a path segment.
			expect(
				formatHeaderLabel("docs2/demo.ts", null, "relative", "docs/setup.md"),
			).toBe("../docs2/demo.ts");
		});

		test("without a note path it falls back to the full vault path", () => {
			expect(formatHeaderLabel("docs/demo.ts", null, "relative")).toBe(
				"docs/demo.ts",
			);
		});

		test("keeps the line range suffix", () => {
			expect(
				formatHeaderLabel(
					"docs/examples/demo.ts",
					{ start: 3, end: 9 },
					"relative",
					"docs/setup.md",
				),
			).toBe("examples/demo.ts:3-9");
		});
	});

	test("unknown style falls back to the full path", () => {
		expect(
			formatHeaderLabel("a/b/X.abap", null, "weird" as never),
		).toBe("a/b/X.abap");
	});
});
