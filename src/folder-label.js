/**
 * The grey folder "chip" shown at the end of the title line.
 * Selecting it opens the move-note picker.
 */

import { MarkdownView, TFile, setIcon } from "obsidian";
import { MoveNoteModal } from "./move-modal.js";

const CHIP_CLASS = "wy-folder-chip";

function folderLabelText(file) {
	let folder = file.parent;
	if (!folder || folder.isRoot()) return "Top level";
	return folder.path.split("/").join(" › ");
}

export function createFolderChip(app, file) {
	let chip = createSpan({
		cls: CHIP_CLASS,
		attr: { role: "button", tabindex: "0", contenteditable: "false" },
	});
	updateFolderChip(chip, file);
	let openMoveModal = (event) => {
		event.preventDefault();
		event.stopPropagation();
		let target = chip.dataset.path
			? app.vault.getAbstractFileByPath(chip.dataset.path)
			: null;
		if (target instanceof TFile) new MoveNoteModal(app, target).open();
	};
	chip.addEventListener("mousedown", (event) => event.preventDefault());
	chip.addEventListener("click", openMoveModal);
	chip.addEventListener("keydown", (event) => {
		if (event.key === "Enter" || event.key === " ") openMoveModal(event);
	});
	return chip;
}

export function updateFolderChip(chip, file) {
	let label = folderLabelText(file);
	if (chip.dataset.path === file.path && chip.dataset.label === label) return;
	chip.dataset.path = file.path;
	chip.dataset.label = label;
	chip.empty();
	setIcon(
		chip.createSpan({ cls: "wy-folder-chip-icon" }),
		file.parent && !file.parent.isRoot() ? "folder" : "folder-tree",
	);
	chip.createSpan({ cls: "wy-folder-chip-text", text: label });
	chip.setAttribute(
		"aria-label",
		`In folder: ${label}. Select to move this note.`,
	);
}

const CHIP_HOST_CLASS = "wy-chip-host";

const TITLE_WITH_CHIP_CLASS = "wy-title-with-chip";

export function syncFolderChips(app, enabled) {
	for (let leaf of app.workspace.getLeavesOfType("markdown")) {
		let view = leaf.view;
		if (!(view instanceof MarkdownView)) continue;
		let containerEl = view.containerEl,
			titles = Array.from(containerEl.querySelectorAll(".inline-title")),
			visibleTitle = titles.find((el) => el.getClientRects().length > 0);
		if (enabled && view.file && !visibleTitle && titles.length) continue;
		let keepChip =
			enabled && view.file && visibleTitle
				? visibleTitle.previousElementSibling
				: null;
		for (let el of Array.from(
			containerEl.querySelectorAll(`.${CHIP_CLASS}`),
		))
			if (el !== keepChip) el.remove();
		if (!enabled || !view.file || !visibleTitle) {
			clearChipLayout(containerEl);
			continue;
		}
		let chip;
		if (keepChip?.hasClass(CHIP_CLASS)) {
			chip = keepChip;
			updateFolderChip(chip, view.file);
		} else {
			chip = createFolderChip(app, view.file);
			visibleTitle.before(chip);
		}
		positionChip(containerEl, chip, visibleTitle);
	}
}

function positionChip(container, chip, title) {
	let host = title.parentElement;
	if (!host) return;
	container
		.querySelectorAll(`.${CHIP_HOST_CLASS}`)
		.forEach((el) => el !== host && el.removeClass(CHIP_HOST_CLASS));
	container
		.querySelectorAll(`.${TITLE_WITH_CHIP_CLASS}`)
		.forEach((el) => el !== title && el.removeClass(TITLE_WITH_CHIP_CLASS));
	host.addClass(CHIP_HOST_CLASS);
	title.addClass(TITLE_WITH_CHIP_CLASS);
	let style = title.win.getComputedStyle(title),
		lineHeight =
			parseFloat(style.lineHeight) ||
			parseFloat(style.fontSize) * 1.2 ||
			32,
		chipHeight = chip.getBoundingClientRect().height || 22,
		top =
			title.offsetTop +
			parseFloat(style.paddingTop || "0") +
			(lineHeight - chipHeight) / 2;
	host.setCssProps({ "--wy-chip-top": `${Math.max(0, Math.round(top))}px` });
	title.setCssProps({
		"--wy-chip-space": `${Math.ceil(chip.getBoundingClientRect().width) + 16}px`,
	});
}

function clearChipLayout(container) {
	container
		.querySelectorAll(`.${CHIP_HOST_CLASS}`)
		.forEach((el) => el.removeClass(CHIP_HOST_CLASS));
	container
		.querySelectorAll(`.${TITLE_WITH_CHIP_CLASS}`)
		.forEach((el) => el.removeClass(TITLE_WITH_CHIP_CLASS));
}

export function removeFolderChips(app) {
	for (let leaf of app.workspace.getLeavesOfType("markdown")) {
		leaf.view.containerEl
			.querySelectorAll(`.${CHIP_CLASS}`)
			.forEach((el) => el.remove());
		clearChipLayout(leaf.view.containerEl);
	}
}
