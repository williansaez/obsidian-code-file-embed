import { describe, expect, test } from "vitest";
import { DEFAULT_SETTINGS } from "./settingsData";

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
