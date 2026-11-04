/**
 * Switches panes between the normal Markdown editor and the WYSIWYG view.
 */

import { FileView, Notice } from "obsidian";
import { hotkeyLabelFor } from "./hotkeys.js";
import { VIEW_TYPE, WysiwygView } from "./view.js";

export class ModeController {
	plugin;
	optOut = new WeakMap();
	syncQueued = false;
	indicators = null;
	constructor(plugin) {
		this.plugin = plugin;
	}
	get app() {
		return this.plugin.app;
	}
	attachIndicators(ribbon, status) {
		this.indicators = { ribbon: ribbon, status: status };
		status.setAttribute("data-tooltip-position", "top");
		for (let n of [ribbon, status])
			this.plugin.registerDomEvent(n, "mouseenter", () =>
				this.refreshIndicators(),
			);
		this.refreshIndicators();
	}
	async toggle() {
		await this.setEnabled(!this.plugin.settings.enabled);
	}
	async setEnabled(enabled) {
		if (
			((this.plugin.settings.enabled = enabled),
			await this.plugin.persist(),
			this.refreshIndicators(),
			enabled)
		) {
			this.optOut = new WeakMap();
			await this.sync();
		} else await this.restoreAll();
		this.plugin.refreshFolderLabels();
		new Notice(enabled ? "WYSIWYG editing on" : "WYSIWYG editing off");
	}
	refreshIndicators() {
		if (!this.indicators) return;
		let enabled = this.plugin.settings.enabled,
			{ ribbon: ribbon, status: status } = this.indicators;
		ribbon.toggleClass("is-active", enabled);
		let tip = this.toggleTip();
		ribbon.setAttribute("aria-label", tip);
		status.setText(enabled ? "WYSIWYG: on" : "WYSIWYG: off");
		status.setAttribute("aria-label", tip);
	}
	toggleTip() {
		let hotkey = hotkeyLabelFor(
			this.app,
			`${this.plugin.manifest.id}:toggle`,
		);
		return (
			(this.plugin.settings.enabled
				? "Turn WYSIWYG editing off"
				: "Turn WYSIWYG editing on") + (hotkey ? ` (${hotkey})` : "")
		);
	}
	async showMarkdownFor(leaf) {
		let file = leaf.view instanceof FileView ? leaf.view.file : null;
		if (file) this.optOut.set(leaf, file.path);
		await this.toMarkdown(leaf);
	}
	async showWysiwygFor(leaf) {
		this.optOut.delete(leaf);
		await this.toWysiwyg(leaf);
	}
	queueSync() {
		if (!this.plugin.settings.enabled || this.syncQueued) return;
		this.syncQueued = true;
		window.setTimeout(() => {
			this.syncQueued = false;
			this.sync();
		}, 0);
	}
	async sync() {
		if (!this.plugin.settings.enabled) return;
		for (let leaf of this.app.workspace.getLeavesOfType("markdown")) {
			let file = leaf.view instanceof FileView ? leaf.view.file : null;
			if (!file || file.extension !== "md") continue;
			let optedOutPath = this.optOut.get(leaf);
			if (optedOutPath === file.path) continue;
			if (optedOutPath) this.optOut.delete(leaf);
			await this.toWysiwyg(leaf);
		}
	}
	async restoreAll() {
		for (let leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE))
			await this.toMarkdown(leaf);
	}
	async toWysiwyg(leaf) {
		let file = leaf.view instanceof FileView ? leaf.view.file : null;
		if (!file || leaf.view.getViewType() === VIEW_TYPE) return;
		let state = leaf.getViewState();
		await leaf.setViewState({
			type: VIEW_TYPE,
			state: { file: file.path },
			pinned: state.pinned,
			active: state.active,
		});
	}
	async toMarkdown(leaf) {
		let view = leaf.view;
		if (!(view instanceof WysiwygView) || !view.file) return;
		let path = view.file.path;
		await view.save();
		let state = leaf.getViewState();
		await leaf.setViewState({
			type: "markdown",
			state: { file: path, mode: "source" },
			pinned: state.pinned,
			active: state.active,
		});
	}
}
