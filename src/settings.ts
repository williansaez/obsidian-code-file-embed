import { App, PluginSettingTab, Setting } from "obsidian";
import type CodeFilePlugin from "./main";
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
}

export const DEFAULT_SETTINGS: CodeFileSettings = {
	showHeader: true,
	headerStyle: "path",
	maxFileSizeKb: 512,
	langOverrides: {},
	autoBakeOnSourceChange: false,
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

export class CodeFileSettingTab extends PluginSettingTab {
	plugin: CodeFilePlugin;

	constructor(app: App, plugin: CodeFilePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Show file header")
			.setDesc("Display a clickable header with the file path above each embed.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showHeader)
					.onChange(async (value) => {
						this.plugin.settings.showHeader = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Header content")
			.setDesc("What the header label shows for each embed.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("path", "Full vault path")
					.addOption("filename", "Filename only")
					.setValue(this.plugin.settings.headerStyle)
					.onChange(async (value) => {
						this.plugin.settings.headerStyle =
							value === "filename" ? "filename" : "path";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Max file size (KB)")
			.setDesc("Refuse to embed files larger than this. Use 0 for no limit.")
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.maxFileSizeKb))
					.onChange(async (value) => {
						const n = parseInt(value, 10);
						this.plugin.settings.maxFileSizeKb = Number.isFinite(n) && n >= 0 ? n : 0;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Auto-bake on source change")
			.setDesc(
				"When a source file referenced by a codefile block is saved, re-bake the notes that embed it (keeps baked blocks ready for Publish).",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoBakeOnSourceChange)
					.onChange(async (value) => {
						this.plugin.settings.autoBakeOnSourceChange = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Language overrides")
			.setDesc("One per line as ext=language, e.g. abap=abap. Overrides the built-in map.")
			.addTextArea((area) => {
				area
					.setValue(overridesToText(this.plugin.settings.langOverrides))
					.onChange(async (value) => {
						this.plugin.settings.langOverrides = textToOverrides(value);
						await this.plugin.saveSettings();
					});
				area.inputEl.rows = 6;
				area.inputEl.addClass("codefile-overrides-input");
			});
	}
}
