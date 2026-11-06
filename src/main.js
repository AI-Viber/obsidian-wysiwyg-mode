/**
 * Plugin entry: commands, ribbon / status bar, events and saved state.
 */

import { Plugin, debounce } from "obsidian";
import { removeFolderChips, syncFolderChips } from "./folder-label.js";
import { addHeaderButtons, removeHeaderButtons } from "./header-buttons.js";
import { EditorActionModal } from "./modals.js";
import { ModeController } from "./mode.js";
import { MoveNoteModal, lastMoveFolder } from "./move-modal.js";
import { DEFAULT_SETTINGS, WysiwygSettingTab } from "./settings.js";
import { VIEW_TYPE, WysiwygView } from "./view.js";

export default class WysiwygPlugin extends Plugin {
	settings = { ...DEFAULT_SETTINGS };
	// Folded headings, by note path.
	folds = {};
	persistSoon = debounce(() => void this.persist(), 1000, true);
	mode = new ModeController(this);

	async onload() {
		let { folds, lastMove, ...saved } = (await this.loadData()) ?? {};
		this.settings = { ...DEFAULT_SETTINGS, ...saved };
		this.folds = folds ?? {};
		lastMoveFolder.path = typeof lastMove === "string" ? lastMove : null;
		lastMoveFolder.save = () => void this.persist();

		this.registerView(VIEW_TYPE, (leaf) => new WysiwygView(leaf, this));

		let ribbon = this.addRibbonIcon(
				"pen-line",
				"Toggle WYSIWYG editing",
				() => void this.mode.toggle(),
			),
			status = this.addStatusBarItem();
		status.addClass("mod-clickable");
		this.registerDomEvent(status, "click", () => void this.mode.toggle());
		this.mode.attachIndicators(ribbon, status);

		this.addCommand({
			id: "toggle",
			name: "Toggle WYSIWYG editing",
			icon: "pen-line",
			callback: () => void this.mode.toggle(),
		});
		this.addCommand({
			id: "toggle-this-pane",
			name: "Switch this pane between WYSIWYG and Markdown",
			checkCallback: (checking) => {
				let leaf = this.app.workspace.getMostRecentLeaf(),
					type = leaf?.view.getViewType();
				if (!leaf || (type !== "markdown" && type !== VIEW_TYPE)) return false;
				if (!checking) {
					if (type === VIEW_TYPE) this.mode.showMarkdownFor(leaf);
					else this.mode.showWysiwygFor(leaf);
				}
				return true;
			},
		});
		this.addCommand({
			id: "run-editor-action",
			name: "Run an editor action from another plugin",
			icon: "square-terminal",
			checkCallback: (checking) => {
				let view = this.app.workspace.getActiveViewOfType(WysiwygView);
				if (!view) return false;
				if (!checking)
					new EditorActionModal(this.app, (command) =>
						view.runBridgeCommand(command),
					).open();
				return true;
			},
		});

		let activeView = () => this.app.workspace.getActiveViewOfType(WysiwygView);
		this.addCommand({
			id: "toggle-fold",
			name: "Fold or unfold the heading at the cursor",
			checkCallback: (checking) => {
				let view = activeView();
				if (view && !checking) view.toggleFold();
				return !!view;
			},
		});
		this.addCommand({
			id: "fold-all",
			name: "Fold all headings",
			checkCallback: (checking) => {
				let view = activeView();
				if (view && !checking) view.foldAll(true);
				return !!view;
			},
		});
		this.addCommand({
			id: "unfold-all",
			name: "Unfold all headings",
			checkCallback: (checking) => {
				let view = activeView();
				if (view && !checking) view.foldAll(false);
				return !!view;
			},
		});
		this.addCommand({
			id: "move-note",
			name: "Move this note to another folder",
			icon: "folder-input",
			checkCallback: (checking) => {
				let file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) new MoveNoteModal(this.app, file).open();
				return true;
			},
		});

		// Keep saved folds attached to a note when it is renamed or deleted.
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				let kept = this.folds[oldPath];
				if (!kept) return;
				delete this.folds[oldPath];
				this.folds[file.path] = kept;
				this.persistSoon();
			}),
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (!this.folds[file.path]) return;
				delete this.folds[file.path];
				this.persistSoon();
			}),
		);

		this.addSettingTab(new WysiwygSettingTab(this.app, this));

		let sync = () => {
			this.mode.queueSync();
			this.refreshFolderLabelsSoon();
		};
		this.registerEvent(this.app.workspace.on("file-open", sync));
		this.registerEvent(this.app.workspace.on("layout-change", sync));
		this.registerEvent(this.app.workspace.on("active-leaf-change", sync));
		this.registerEvent(
			this.app.vault.on("rename", () => this.refreshFolderLabelsSoon()),
		);
		this.app.workspace.onLayoutReady(sync);

		this.register(() => removeFolderChips(this.app));
		this.register(() => removeHeaderButtons(this.app));
	}

	onunload() {
		this.mode.restoreAll();
	}

	refreshFolderLabels() {
		syncFolderChips(this.app, this.settings.showFolder);
		let enabled = this.settings.enabled;
		addHeaderButtons(
			this.app,
			(view) =>
				void (this.settings.enabled
					? this.mode.showWysiwygFor(view.leaf)
					: this.mode.setEnabled(true)),
			enabled ? "Edit this note in WYSIWYG" : this.mode.toggleTip(),
		);
	}

	refreshFolderLabelsSoon() {
		this.refreshFolderLabels();
		window.setTimeout(() => this.refreshFolderLabels(), 150);
	}

	getFolds(path) {
		return this.folds[path] ?? [];
	}

	setFolds(path, headings) {
		let current = this.folds[path] ?? [];
		if (
			current.length === headings.length &&
			current.every((key, i) => key === headings[i])
		)
			return;
		if (headings.length) this.folds[path] = headings;
		else delete this.folds[path];
		this.persistSoon();
	}

	async persist() {
		await this.saveData({
			...this.settings,
			folds: this.folds,
			lastMove: lastMoveFolder.path,
		});
	}

	async saveSettings() {
		await this.persist();
		for (let leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE))
			if (leaf.view instanceof WysiwygView) leaf.view.applySettings();
		this.refreshFolderLabels();
	}
}
