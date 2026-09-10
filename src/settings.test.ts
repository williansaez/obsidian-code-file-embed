import { describe, expect, test } from "vitest";
import {
	DEFAULT_SETTINGS,
	readSettingValue,
	settingDefinitions,
	writeSettingValue,
	type CodeFileSettings,
} from "./settingsData";

function fresh(): CodeFileSettings {
	return { ...DEFAULT_SETTINGS, langOverrides: { ...DEFAULT_SETTINGS.langOverrides } };
}

describe("DEFAULT_SETTINGS", () => {
	test("baked blocks render as baked, not live, out of the box", () => {
		// Baking exists so the note shows exactly what will be published;
		// upgrading baked blocks to a live embed silently breaks that.
		expect(DEFAULT_SETTINGS.livePreviewBakedBlocks).toBe(false);
	});

	test("auto-bake stays opt-in", () => {
		expect(DEFAULT_SETTINGS.autoBakeOnSourceChange).toBe(false);
	});
});

describe("settingDefinitions", () => {
	const defs = settingDefinitions();
	const controls = defs.flatMap((d) => ("control" in d && d.control ? [d] : []));
	const keys = controls.map((d) => d.control.key);

	test("every persisted setting has a searchable control", () => {
		// langOverrides is a map; the UI edits it through a text bridge key.
		const expected = Object.keys(DEFAULT_SETTINGS)
			.filter((k) => k !== "langOverrides")
			.concat("langOverridesText");
		expect([...keys].sort()).toEqual([...expected].sort());
	});

	test("every control key round-trips through the value bridge", () => {
		const s = fresh();
		for (const key of keys) {
			expect(readSettingValue(s, key), key).not.toBeUndefined();
		}
	});

	test("header style dropdown offers path, filename and relative", () => {
		const def = controls.find((d) => d.control.key === "headerStyle");
		expect(def?.control.type).toBe("dropdown");
		if (def?.control.type !== "dropdown") return;
		expect(Object.keys(def.control.options).sort()).toEqual(
			["filename", "path", "relative"].sort(),
		);
	});

	test("every control has a name and description for search", () => {
		for (const d of controls) {
			expect(d.name, d.control.key).toBeTruthy();
			expect(d.desc, d.control.key).toBeTruthy();
		}
	});
});

describe("setting value bridge", () => {
	test("reads plain settings by key", () => {
		const s = fresh();
		expect(readSettingValue(s, "showHeader")).toBe(true);
		expect(readSettingValue(s, "maxFileSizeKb")).toBe(512);
	});

	test("unknown keys read as undefined and are not written", () => {
		const s = fresh();
		expect(readSettingValue(s, "nope")).toBeUndefined();
		expect(writeSettingValue(s, "nope", 1)).toBe(false);
		expect(s).toEqual(fresh());
	});

	test("langOverridesText serializes the overrides map", () => {
		const s = fresh();
		s.langOverrides = { abap: "abap", txt: "text" };
		expect(readSettingValue(s, "langOverridesText")).toBe("abap=abap\ntxt=text");
	});

	test("writing langOverridesText parses ext=lang lines", () => {
		const s = fresh();
		expect(writeSettingValue(s, "langOverridesText", "abap=abap\n.TXT: text")).toBe(true);
		expect(s.langOverrides).toEqual({ abap: "abap", txt: "text" });
	});

	test("maxFileSizeKb accepts numbers and numeric strings, clamps junk to 0", () => {
		const s = fresh();
		writeSettingValue(s, "maxFileSizeKb", 128);
		expect(s.maxFileSizeKb).toBe(128);
		writeSettingValue(s, "maxFileSizeKb", "64");
		expect(s.maxFileSizeKb).toBe(64);
		writeSettingValue(s, "maxFileSizeKb", -5);
		expect(s.maxFileSizeKb).toBe(0);
		writeSettingValue(s, "maxFileSizeKb", "abc");
		expect(s.maxFileSizeKb).toBe(0);
	});

	test("headerStyle only accepts known styles", () => {
		const s = fresh();
		writeSettingValue(s, "headerStyle", "relative");
		expect(s.headerStyle).toBe("relative");
		writeSettingValue(s, "headerStyle", "filename");
		expect(s.headerStyle).toBe("filename");
		writeSettingValue(s, "headerStyle", "bogus");
		expect(s.headerStyle).toBe("path");
	});

	test("toggles coerce to boolean", () => {
		const s = fresh();
		writeSettingValue(s, "autoBakeOnSourceChange", true);
		expect(s.autoBakeOnSourceChange).toBe(true);
		writeSettingValue(s, "livePreviewBakedBlocks", 1);
		expect(s.livePreviewBakedBlocks).toBe(true);
		writeSettingValue(s, "showHeader", 0);
		expect(s.showHeader).toBe(false);
	});
});
