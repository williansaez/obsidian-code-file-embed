import {
	App,
	PluginSettingTab,
	Setting,
	type SettingDefinitionItem,
} from "obsidian";
import type CodeFilePlugin from "./main";
import {
	readSettingValue,
	settingDefinitions,
	writeSettingValue,
} from "./settingsData";

export type { CodeFileSettings } from "./settingsData";
export {
	DEFAULT_SETTINGS,
	overridesToText,
	textToOverrides,
} from "./settingsData";

/**
 * Settings tab. On Obsidian 1.13+ the tab is rendered from
 * `getSettingDefinitions()`, which also feeds the settings search (issue #3).
 * Older versions never call it and fall back to `display()`, which renders
 * the same definitions imperatively so `minAppVersion` can stay at 1.4.0.
 */
export class CodeFileSettingTab extends PluginSettingTab {
	plugin: CodeFilePlugin;

	constructor(app: App, plugin: CodeFilePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return settingDefinitions();
	}

	getControlValue(key: string): unknown {
		return readSettingValue(this.plugin.settings, key);
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (!writeSettingValue(this.plugin.settings, key, value)) return;
		await this.plugin.saveSettings();
	}

	/** Fallback for Obsidian < 1.13, which has no declarative settings. */
	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		for (const def of settingDefinitions()) {
			if (!("control" in def) || !def.control) continue;
			const control = def.control;
			const setting = new Setting(containerEl).setName(def.name);
			if (def.desc) setting.setDesc(def.desc);
			const save = (value: unknown) => void this.setControlValue(control.key, value);
			const current = this.getControlValue(control.key);

			switch (control.type) {
				case "toggle":
					setting.addToggle((t) => t.setValue(Boolean(current)).onChange(save));
					break;
				case "dropdown":
					setting.addDropdown((d) => {
						for (const [value, label] of Object.entries(control.options)) {
							d.addOption(value, label);
						}
						d.setValue(String(current)).onChange(save);
					});
					break;
				case "number":
				case "text":
					setting.addText((t) => t.setValue(String(current ?? "")).onChange(save));
					break;
				case "textarea":
					setting.addTextArea((area) => {
						area.setValue(String(current ?? "")).onChange(save);
						if (control.rows) area.inputEl.rows = control.rows;
						area.inputEl.addClass("codefile-overrides-input");
					});
					break;
				default:
					break;
			}
		}
	}
}
