import { HeaderStyle } from "./header";

export interface CodeFileSettings {
	/** Show the clickable header with the file path above the code. */
	showHeader: boolean;
	/** What the header label shows: full vault path or just the filename. */
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
