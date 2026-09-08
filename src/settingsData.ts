import type { SettingDefinitionItem } from "obsidian";
import type { HeaderStyle } from "./header";

export interface CodeFileSettings {
	/** Show the clickable header with the file path above the code. */
	showHeader: boolean;
	/** What the header label shows: vault path, filename, or path relative to the note. */
	headerStyle: HeaderStyle;
	/** Max file size in KB before refusing to embed (0 = unlimited). */
	maxFileSizeKb: number;
	/** Extension -> language overrides, merged over the default map. */
	langOverrides: Record<string, string>;
	/** Re-bake notes automatically when a referenced source file is saved. */
	autoBakeOnSourceChange: boolean;
	/**
	 * Render baked blocks as a live embed instead of the baked snapshot.
	 * Off by default: baking exists so the note shows exactly what will be
	 * published, and a live embed hides drift between the two.
	 */
	livePreviewBakedBlocks: boolean;
}

export const DEFAULT_SETTINGS: CodeFileSettings = {
	showHeader: true,
	headerStyle: "path",
	maxFileSizeKb: 512,
	langOverrides: {},
	autoBakeOnSourceChange: false,
	livePreviewBakedBlocks: false,
};

const HEADER_STYLES: readonly HeaderStyle[] = ["path", "filename", "relative"];

/** Serialize overrides to `ext=lang` lines for the settings textarea. */
export function overridesToText(overrides: Record<string, string>): string {
	return Object.entries(overrides)
		.map(([ext, lang]) => `${ext}=${lang}`)
		.join("\n");
}

/** Parse `ext=lang` / `ext:lang` lines back into an overrides map. */
export function textToOverrides(text: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const match = trimmed.match(/^([^=:]+)[=:](.+)$/);
		if (!match) continue;
		const ext = match[1].trim().toLowerCase().replace(/^\./, "");
		const lang = match[2].trim();
		if (ext && lang) out[ext] = lang;
	}
	return out;
}

/**
 * Keys the settings UI reads and writes. `langOverridesText` is a bridge:
 * the UI edits the overrides map as `ext=lang` text.
 */
export type SettingKey =
	| Exclude<keyof CodeFileSettings, "langOverrides">
	| "langOverridesText";

/** Value of a setting as the UI control expects it (issue #3). */
export function readSettingValue(
	settings: CodeFileSettings,
	key: string,
): unknown {
	switch (key as SettingKey) {
		case "langOverridesText":
			return overridesToText(settings.langOverrides);
		case "showHeader":
		case "headerStyle":
		case "maxFileSizeKb":
		case "autoBakeOnSourceChange":
		case "livePreviewBakedBlocks":
			return settings[key as Exclude<SettingKey, "langOverridesText">];
		default:
			return undefined;
	}
}

/**
 * Store a control value, coercing it to the setting's type. Returns false
 * for unknown keys so callers can skip the save.
 */
export function writeSettingValue(
	settings: CodeFileSettings,
	key: string,
	value: unknown,
): boolean {
	switch (key as SettingKey) {
		case "showHeader":
		case "autoBakeOnSourceChange":
		case "livePreviewBakedBlocks":
			settings[key as "showHeader"] = Boolean(value);
			return true;
		case "headerStyle":
			settings.headerStyle = HEADER_STYLES.includes(value as HeaderStyle)
				? (value as HeaderStyle)
				: "path";
			return true;
		case "maxFileSizeKb": {
			const n = typeof value === "number" ? value : parseInt(String(value), 10);
			settings.maxFileSizeKb = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
			return true;
		}
		case "langOverridesText":
			settings.langOverrides = textToOverrides(String(value ?? ""));
			return true;
		default:
			return false;
	}
}

/**
 * Declarative definitions for the settings tab (Obsidian 1.13+ renders and
 * indexes these for settings search). The legacy `display()` fallback
 * renders the same list, so this is the single source of truth.
 */
export function settingDefinitions(): SettingDefinitionItem<SettingKey>[] {
	return [
		{
			name: "Show file header",
			desc: "Display a clickable header with the file path above each embed.",
			control: { type: "toggle", key: "showHeader" },
		},
		{
			name: "Header content",
			desc: "What the header label shows for each embed. Relative paths climb with ../ when the file sits outside the note's folder.",
			aliases: ["path", "filename", "relative path"],
			control: {
				type: "dropdown",
				key: "headerStyle",
				options: {
					path: "Full vault path",
					filename: "Filename only",
					relative: "Path relative to the note",
				},
			},
		},
		{
			name: "Max file size (KB)",
			desc: "Refuse to embed files larger than this. Use 0 for no limit.",
			control: {
				type: "number",
				key: "maxFileSizeKb",
				min: 0,
				step: 1,
				validate: (v) =>
					Number.isFinite(v) && v >= 0 ? undefined : "Enter 0 or a positive number.",
			},
		},
		{
			name: "Auto-bake on source change",
			desc: "When a source file referenced by a codefile block is saved, re-bake the notes that embed it (keeps baked blocks ready for Publish).",
			aliases: ["publish"],
			control: { type: "toggle", key: "autoBakeOnSourceChange" },
		},
		{
			name: "Live preview of baked blocks",
			desc: "Render baked blocks from the source file instead of the baked snapshot. Off keeps reading view showing exactly what will be published; on trades that guarantee for an always-current preview.",
			aliases: ["publish"],
			control: { type: "toggle", key: "livePreviewBakedBlocks" },
		},
		{
			name: "Language overrides",
			desc: "One per line as ext=language, e.g. abap=abap. Overrides the built-in map.",
			aliases: ["extension", "syntax highlighting"],
			control: { type: "textarea", key: "langOverridesText", rows: 6 },
		},
	];
}
