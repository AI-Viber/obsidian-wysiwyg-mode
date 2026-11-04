/**
 * Note-header buttons for Obsidian's own editing/reading views:
 * step through heading levels (collapse/expand) and switch WYSIWYG on.
 */

import { MarkdownView, Platform, setIcon } from "obsidian";

const COLLAPSE_ICON = "chevrons-down-up";

const EXPAND_ICON = "chevrons-up-down";

const headerButtons = new WeakMap();

export function updateFoldButton(button, canCollapse) {
	let altKeyName = Platform.isMacOS ? "⌥" : "Alt",
		label = canCollapse
			? "Collapse all headings"
			: `Expand one level (${altKeyName}-click to expand all)`;
	if (button.getAttribute("aria-label") === label) return;
	setIcon(button, canCollapse ? COLLAPSE_ICON : EXPAND_ICON);
	button.setAttribute("aria-label", label);
}

function getHeadings(app, view) {
	let file = view.file;
	return (
		file ? (app.metadataCache.getFileCache(file)?.headings ?? []) : []
	).map((heading) => ({
		level: heading.level,
		line: heading.position.start.line,
	}));
}

function foldEditorToLevel(view, headings, level) {
	let editor = view.editor;
	if ((editor.exec("unfoldAll"), level === null)) return;
	let cursor = editor.getCursor(),
		scroll = editor.getScrollInfo();
	for (let heading of headings) {
		if (heading.level !== level) continue;
		editor.setCursor({ line: heading.line, ch: 0 });
		editor.exec("toggleFold");
	}
	editor.setCursor(cursor);
	editor.scrollTo(scroll.left, scroll.top);
}

function foldReadingViewToLevel(view, level) {
	view.containerEl
		.querySelectorAll(
			".markdown-reading-view .markdown-preview-section > div",
		)
		.forEach((section) => {
			let heading = section.querySelector("h1, h2, h3, h4, h5, h6"),
				indicator = section.querySelector(
					".heading-collapse-indicator",
				);
			if (!heading || !indicator) return;
			let shouldCollapse =
				level !== null && Number(heading.tagName[1]) === level;
			if (section.hasClass("is-collapsed") !== shouldCollapse)
				indicator.click();
		});
}

/**
 * Header-button handler: fold to the top heading level, then open one level at a time.
 * Alt-click opens everything.
 */
function stepOutline(app, view, state, expandAll) {
	let headings = getHeadings(app, view),
		levels = Array.from(new Set(headings.map((l) => l.level))).sort(
			(l, a) => l - a,
		);
	if (!levels.length) return;
	if (state.path !== (view.file?.path ?? null)) state.level = null;
	state.path = view.file?.path ?? null;
	let nextLevel;
	if (state.level === null) nextLevel = levels[0] ?? null;
	else if (expandAll) nextLevel = null;
	else nextLevel = levels.find((l) => l > (state.level ?? 0)) ?? null;
	if (view.getMode() === "source")
		foldEditorToLevel(view, headings, nextLevel);
	else foldReadingViewToLevel(view, nextLevel);
	state.level = nextLevel;
	updateFoldButton(state.fold, nextLevel === null);
}

export function addHeaderButtons(app, onToggleWysiwyg, tooltip) {
	for (let leaf of app.workspace.getLeavesOfType("markdown")) {
		let view = leaf.view;
		if (!(view instanceof MarkdownView)) continue;
		let existing = headerButtons.get(view);
		if (!existing || !existing.fold.isConnected) {
			let state = { level: null, path: null };
			state.wysiwyg = view.addAction("pen-line", tooltip, () =>
				onToggleWysiwyg(view),
			);
			state.fold = view.addAction(
				COLLAPSE_ICON,
				"Collapse all headings",
				(event) => stepOutline(app, view, state, event.altKey),
			);
			state.wysiwyg.addClass("wy-header-wysiwyg");
			headerButtons.set(view, state);
			existing = state;
		}
		existing.wysiwyg.setAttribute("aria-label", tooltip);
	}
}

export function removeHeaderButtons(app) {
	for (let leaf of app.workspace.getLeavesOfType("markdown")) {
		let view = leaf.view;
		if (!(view instanceof MarkdownView)) continue;
		let state = headerButtons.get(view);
		state?.fold.remove();
		state?.wysiwyg.remove();
		headerButtons.delete(view);
	}
}
