/**
 * Folder picker for moving a note (also creates new folders).
 * The folder used last is listed first.
 */

import {
	Notice,
	SuggestModal,
	TFolder,
	normalizePath,
	setIcon,
} from "obsidian";

export const lastMoveFolder = { path: null };

export class MoveNoteModal extends SuggestModal {
	file;
	constructor(app, file) {
		super(app);
		this.file = file;
		this.setPlaceholder(`Move "${file.basename}" to…`);
		this.setInstructions([
			{ command: "↑↓", purpose: "to choose" },
			{ command: "↵", purpose: "to move" },
			{ command: "esc", purpose: "to cancel" },
		]);
	}
	folders() {
		return this.app.vault
			.getAllLoadedFiles()
			.filter((e) => e instanceof TFolder)
			.sort((e, t) =>
				e.isRoot() ? -1 : t.isRoot() ? 1 : e.path.localeCompare(t.path),
			);
	}
	getSuggestions(query) {
		let needle = query.trim().toLowerCase(),
			currentFolderPath = this.file.parent?.path,
			suggestions = this.folders()
				.filter((o) => o.path !== currentFolderPath)
				.filter(
					(o) =>
						!needle ||
						(o.isRoot()
							? "top level"
							: o.path.toLowerCase()
						).includes(needle),
				)
				.map((o) => ({ folder: o })),
			lastIndex = suggestions.findIndex(
				(o) =>
					(o.folder.isRoot() ? "" : o.folder.path) ===
					lastMoveFolder.path,
			);
		if (lastMoveFolder.path !== null && lastIndex > 0) {
			let [o] = suggestions.splice(lastIndex, 1);
			o.last = true;
			suggestions.unshift(o);
		} else if (lastIndex === 0) suggestions[0].last = true;
		let normalizedPath = normalizePath(query.trim()),
			exists =
				!!normalizedPath &&
				this.app.vault.getAbstractFileByPath(normalizedPath) instanceof
					TFolder;
		if (normalizedPath && normalizedPath !== "/" && !exists)
			suggestions.push({ create: normalizedPath });
		return suggestions;
	}
	renderSuggestion(suggestion, el) {
		el.addClass("wy-folder-suggestion");
		let icon = el.createSpan({ cls: "wy-folder-suggestion-icon" });
		if ("create" in suggestion) {
			setIcon(icon, "folder-plus");
			el.createSpan({
				text: `Create folder "${suggestion.create}" and move here`,
			});
			return;
		}
		let folder = suggestion.folder;
		setIcon(icon, folder.isRoot() ? "folder-tree" : "folder");
		el.createSpan({
			text: folder.isRoot()
				? "Top level of the vault"
				: folder.path.split("/").join(" › "),
		});
		suggestion.last &&
			el.createSpan({
				cls: "wy-folder-suggestion-hint",
				text: "Last used",
			});
	}
	onChooseSuggestion(suggestion) {
		this.move(suggestion);
	}
	async move(suggestion) {
		try {
			let destination;
			if ("create" in suggestion) {
				await this.app.vault.createFolder(suggestion.create);
				destination = suggestion.create;
			} else
				destination = suggestion.folder.isRoot()
					? ""
					: suggestion.folder.path;
			let newPath = normalizePath(
				destination
					? `${destination}/${this.file.name}`
					: this.file.name,
			);
			if (this.app.vault.getAbstractFileByPath(newPath)) {
				new Notice(
					`A note called "${this.file.name}" is already in that folder.`,
				);
				return;
			}
			await this.app.fileManager.renameFile(this.file, newPath);
			lastMoveFolder.path = destination;
			lastMoveFolder.save?.();
			new Notice(
				`Moved to ${destination ? destination.split("/").join(" › ") : "the top level"}.`,
			);
		} catch (destination) {
			new Notice(`Couldn't move the note: ${destination.message}`);
		}
	}
}
