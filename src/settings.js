/**
 * Plugin settings and the settings tab.
 */

import { PluginSettingTab, Setting } from "obsidian";

export const DEFAULT_SETTINGS = {
	enabled: false,
	showToolbar: true,
	showTitle: true,
	showFolder: true,
	pageStyle: "paper",
	pageWidth: 760,
	linkClick: "mod",
	useTabs: true,
};

export class WysiwygSettingTab extends PluginSettingTab {
	plugin;
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}
	display() {
		let { containerEl: containerEl } = this;
		containerEl.empty();
		let settings = this.plugin.settings,
			save = async () => this.plugin.saveSettings();
		new Setting(containerEl)
			.setName("WYSIWYG editor")
			.setDesc(
				"Open notes in the word-processor editor. You can also use the ribbon button, the status bar item, or the toggle command.",
			)
			.addToggle((control) =>
				control
					.setValue(settings.enabled)
					.onChange((value) => this.plugin.mode.setEnabled(value)),
			);
		new Setting(containerEl).setName("Appearance").setHeading();
		new Setting(containerEl)
			.setName("Formatting toolbar")
			.setDesc("Show the toolbar above the page.")
			.addToggle((control) =>
				control
					.setValue(settings.showToolbar)
					.onChange(async (value) => {
						settings.showToolbar = value;
						await save();
					}),
			);
		new Setting(containerEl)
			.setName("Note title")
			.setDesc(
				"Show an editable title above the text. Changing it renames the file.",
			)
			.addToggle((control) =>
				control.setValue(settings.showTitle).onChange(async (value) => {
					settings.showTitle = value;
					await save();
				}),
			);
		new Setting(containerEl)
			.setName("Folder next to title")
			.setDesc(
				"Show which folder the note is in, at the end of the title line, in both WYSIWYG and normal editing. Select it to move the note to another folder.",
			)
			.addToggle((control) =>
				control
					.setValue(settings.showFolder)
					.onChange(async (value) => {
						settings.showFolder = value;
						await save();
					}),
			);
		new Setting(containerEl)
			.setName("Page style")
			.setDesc(
				"Paper shows the note as a sheet on a shaded background, like a word processor.",
			)
			.addDropdown((control) =>
				control
					.addOption("paper", "Paper")
					.addOption("plain", "Plain")
					.setValue(settings.pageStyle)
					.onChange(async (value) => {
						settings.pageStyle =
							value === "plain" ? "plain" : "paper";
						await save();
					}),
			);
		new Setting(containerEl)
			.setName("Page width")
			.setDesc("Maximum width of the text column, in pixels.")
			.addSlider((control) =>
				control
					.setLimits(500, 1400, 20)
					.setValue(settings.pageWidth)
					.setDynamicTooltip()
					.onChange(async (value) => {
						settings.pageWidth = value;
						await save();
					}),
			);
		new Setting(containerEl).setName("Behavior").setHeading();
		new Setting(containerEl)
			.setName("Opening links")
			.setDesc(
				"A plain click places the cursor, like a word processor. Choose whether links need a modifier key to open.",
			)
			.addDropdown((control) =>
				control
					.addOption("mod", "Ctrl/Cmd + click opens")
					.addOption("click", "Click opens")
					.setValue(settings.linkClick)
					.onChange(async (value) => {
						settings.linkClick =
							value === "click" ? "click" : "mod";
						await save();
					}),
			);
		new Setting(containerEl)
			.setName("Indent lists with tabs")
			.setDesc(
				"How nested lists are written to the Markdown file. Off uses four spaces.",
			)
			.addToggle((control) =>
				control.setValue(settings.useTabs).onChange(async (value) => {
					settings.useTabs = value;
					await save();
				}),
			);
	}
}
