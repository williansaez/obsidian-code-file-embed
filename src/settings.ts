import { App, PluginSettingTab, Setting } from "obsidian";
import type CodeFilePlugin from "./main";
import { overridesToText, textToOverrides } from "./settingsData";

export type { CodeFileSettings } from "./settingsData";
export {
	DEFAULT_SETTINGS,
	overridesToText,
	textToOverrides,
} from "./settingsData";

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
			.setName("Live preview of baked blocks")
			.setDesc(
				"Render baked blocks from the source file instead of the baked snapshot. Off keeps reading view showing exactly what will be published; on trades that guarantee for an always-current preview.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.livePreviewBakedBlocks)
					.onChange(async (value) => {
						this.plugin.settings.livePreviewBakedBlocks = value;
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
