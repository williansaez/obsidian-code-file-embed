import { describe, expect, test } from "vitest";
import {
	bakeMarkdown,
	unbakeMarkdown,
	parseBakedFenceLine,
	planBakeWrite,
	mentionsCodeFileTarget,
	BakeOptions,
} from "./bake";

/** Build options backed by an in-memory vault: linkpath -> file content. */
function opts(files: Record<string, string>): BakeOptions {
	return {
		resolve: (linkpath) =>
			linkpath in files
				? { path: linkpath, content: files[linkpath] }
				: null,
		langFor: (path) => {
			const ext = path.split(".").pop() ?? "";
			return { abap: "abap", py: "python" }[ext] ?? ext;
		},
	};
}

const ABAP = "line one\nline two\nline three\nline four";

describe("bakeMarkdown", () => {
	test("bakes a codefile block with header spec into a marked language fence", async () => {
		const md = "before\n\n```codefile _src/X.abap\n```\n\nafter";
		const res = await bakeMarkdown(md, opts({ "_src/X.abap": ABAP }));
		expect(res.output).toBe(
			"before\n\n```abap codefile:_src/X.abap\n" +
				ABAP +
				"\n```\n\nafter",
		);
		expect(res.bakedCount).toBe(1);
		expect(res.errors).toEqual([]);
	});

	test("slices a line range", async () => {
		const md = "```codefile _src/X.abap:2-3\n```";
		const res = await bakeMarkdown(md, opts({ "_src/X.abap": ABAP }));
		expect(res.output).toBe(
			"```abap codefile:_src/X.abap:2-3\nline two\nline three\n```",
		);
	});

	test("slices a single line", async () => {
		const md = "```codefile _src/X.abap:2\n```";
		const res = await bakeMarkdown(md, opts({ "_src/X.abap": ABAP }));
		expect(res.output).toContain("\nline two\n```");
		expect(res.output).not.toContain("line one");
		expect(res.output).not.toContain("line three");
	});

	test("swaps a reversed range", async () => {
		const md = "```codefile _src/X.abap:3-2\n```";
		const res = await bakeMarkdown(md, opts({ "_src/X.abap": ABAP }));
		expect(res.output).toContain("line two\nline three");
	});

	test("range beyond the file bakes the whole file with a warning", async () => {
		const md = "```codefile _src/X.abap:99-120\n```";
		const res = await bakeMarkdown(md, opts({ "_src/X.abap": ABAP }));
		expect(res.output).toContain(ABAP);
		expect(res.warnings).toHaveLength(1);
		expect(res.warnings[0]).toContain("_src/X.abap");
	});

	test("supports the spec-in-body form, moving the spec to the fence line", async () => {
		const md = "```codefile\n_src/X.abap:1-2\n```";
		const res = await bakeMarkdown(md, opts({ "_src/X.abap": ABAP }));
		expect(res.output).toBe(
			"```abap codefile:_src/X.abap:1-2\nline one\nline two\n```",
		);
	});

	test("leaves the block untouched and reports an error when the file is missing", async () => {
		const md = "```codefile _src/missing.abap\n```";
		const res = await bakeMarkdown(md, opts({}));
		expect(res.output).toBe(md);
		expect(res.bakedCount).toBe(0);
		expect(res.errors).toHaveLength(1);
		expect(res.errors[0]).toContain("_src/missing.abap");
	});

	test("refreshes an already-baked block from the source file", async () => {
		const md = "```abap codefile:_src/X.abap:1-2\nstale content\n```";
		const res = await bakeMarkdown(md, opts({ "_src/X.abap": ABAP }));
		expect(res.output).toBe(
			"```abap codefile:_src/X.abap:1-2\nline one\nline two\n```",
		);
		expect(res.bakedCount).toBe(1);
	});

	test("is idempotent", async () => {
		const md = "x\n\n```codefile _src/X.abap:2-3\n```\n\ny";
		const o = opts({ "_src/X.abap": ABAP });
		const once = (await bakeMarkdown(md, o)).output;
		const twice = (await bakeMarkdown(once, o)).output;
		expect(twice).toBe(once);
	});

	test("leaves ordinary fenced blocks, inline code, and text untouched", async () => {
		const md =
			"# T\n\n```abap\nWRITE 'x'.\n```\n\n`inline`\n\n~~~python\nprint(1)\n~~~\n";
		const res = await bakeMarkdown(md, opts({}));
		expect(res.output).toBe(md);
		expect(res.bakedCount).toBe(0);
		expect(res.errors).toEqual([]);
	});

	test("uses a longer fence when the content contains triple backticks", async () => {
		const content = "a\n```\nb";
		const md = "```codefile _src/X.abap\n```";
		const res = await bakeMarkdown(md, opts({ "_src/X.abap": content }));
		expect(res.output).toBe(
			"````abap codefile:_src/X.abap\na\n```\nb\n````",
		);
	});

	test("maps the language from the resolved file extension", async () => {
		const md = "```codefile scripts/tool.py\n```";
		const res = await bakeMarkdown(md, opts({ "scripts/tool.py": "print(1)" }));
		expect(res.output).toBe(
			"```python codefile:scripts/tool.py\nprint(1)\n```",
		);
	});

	test("accepts an async resolver", async () => {
		const md = "```codefile _src/X.abap:1-2\n```";
		const res = await bakeMarkdown(md, {
			resolve: async () => ({ path: "_src/X.abap", content: ABAP }),
			langFor: () => "abap",
		});
		expect(res.output).toBe(
			"```abap codefile:_src/X.abap:1-2\nline one\nline two\n```",
		);
	});

	test("reports a resolver-provided error and leaves the block untouched", async () => {
		const md = "```codefile _src/big.abap\n```";
		const res = await bakeMarkdown(md, {
			resolve: () => ({ error: "arquivo grande demais: _src/big.abap" }),
			langFor: () => "abap",
		});
		expect(res.output).toBe(md);
		expect(res.bakedCount).toBe(0);
		expect(res.errors).toEqual(["arquivo grande demais: _src/big.abap"]);
	});

	test("does not treat codefile-like lines inside other fences as blocks", async () => {
		const md =
			"````markdown\n```codefile _src/X.abap\n```\n````";
		const res = await bakeMarkdown(md, opts({ "_src/X.abap": ABAP }));
		expect(res.output).toBe(md);
		expect(res.bakedCount).toBe(0);
	});
});

describe("parseBakedFenceLine", () => {
	test("extracts the spec from a baked fence line", async () => {
		expect(parseBakedFenceLine("```abap codefile:_src/X.abap:150-219")).toBe(
			"_src/X.abap:150-219",
		);
		expect(parseBakedFenceLine("````python codefile:a b.py")).toBe("a b.py");
	});

	test("returns null for ordinary fence lines", async () => {
		expect(parseBakedFenceLine("```abap")).toBeNull();
		expect(parseBakedFenceLine("```codefile _src/X.abap")).toBeNull();
		expect(parseBakedFenceLine("plain text")).toBeNull();
	});
});

describe("mentionsCodeFileTarget", () => {
	test("matches a live codefile block referencing the file", () => {
		const md = "```codefile _src/ZCL_MVO_UTIL.abap:150-219\n```";
		expect(mentionsCodeFileTarget(md, "ZCL_MVO_UTIL.abap")).toBe(true);
	});

	test("matches a baked block referencing the file, case-insensitively", () => {
		const md = "```abap codefile:_src/zcl_mvo_util.abap\ncode\n```";
		expect(mentionsCodeFileTarget(md, "ZCL_MVO_UTIL.abap")).toBe(true);
	});

	test("rejects notes that never mention the file", () => {
		const md = "```codefile _src/OTHER.abap\n```";
		expect(mentionsCodeFileTarget(md, "ZCL_MVO_UTIL.abap")).toBe(false);
	});

	test("rejects notes that mention the file without any codefile block", () => {
		const md = "See [[ZCL_MVO_UTIL.abap]] for details.";
		expect(mentionsCodeFileTarget(md, "ZCL_MVO_UTIL.abap")).toBe(false);
	});
});

describe("unbakeMarkdown", () => {
	test("converts a baked block back to an empty codefile block", async () => {
		const md = "```abap codefile:_src/X.abap:1-2\nline one\nline two\n```";
		const res = unbakeMarkdown(md);
		expect(res.output).toBe("```codefile _src/X.abap:1-2\n```");
		expect(res.unbakedCount).toBe(1);
	});

	test("leaves ordinary blocks alone", async () => {
		const md = "```abap\nWRITE 'x'.\n```";
		const res = unbakeMarkdown(md);
		expect(res.output).toBe(md);
		expect(res.unbakedCount).toBe(0);
	});

	test("round-trips a baked block with a long fence", async () => {
		const content = "a\n```\nb";
		const o = opts({ "_src/X.abap": content });
		const baked = (await bakeMarkdown("```codefile _src/X.abap\n```", o))
			.output;
		const res = unbakeMarkdown(baked);
		expect(res.output).toBe("```codefile _src/X.abap\n```");
	});
});

describe("planBakeWrite", () => {
	test("writes when the file is untouched and the bake changed something", () => {
		expect(planBakeWrite("old", "new", "old")).toEqual({
			action: "write",
			output: "new",
		});
	});

	test("skips when the bake produced no change", () => {
		expect(planBakeWrite("same", "same", "same")).toEqual({
			action: "skip",
			reason: "unchanged",
		});
	});

	test("refuses to write when the note changed since it was read", () => {
		expect(planBakeWrite("old", "new", "edited by user")).toEqual({
			action: "skip",
			reason: "file-changed",
		});
	});

	test("prefers reporting the concurrent edit over reporting no change", () => {
		// Bake was a no-op, but the note moved on anyway: never clobber.
		expect(planBakeWrite("old", "old", "edited by user")).toEqual({
			action: "skip",
			reason: "file-changed",
		});
	});
});
