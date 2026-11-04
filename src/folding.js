/**
 * Heading folding for the WYSIWYG page (display only; state is kept per note).
 */

const HEADING_TAG = /^H([1-6])$/;

export const COLLAPSED_CLASS = "wy-collapsed";

export function headingLevel(element) {
	let match = element.tagName.match(HEADING_TAG);
	return match ? Number(match[1]) : 0;
}

function childElements(parent) {
	return Array.from(parent.children).filter((t) => t.instanceOf(HTMLElement));
}

function headingKeys(editor) {
	let counts = new Map(),
		keys = new Map();
	for (let heading of childElements(editor)) {
		let level = headingLevel(heading);
		if (!level) continue;
		let base = `${level}:${(heading.textContent ?? "").replace(/​/g, "").trim()}`,
			count = counts.get(base) ?? 0;
		counts.set(base, count + 1);
		keys.set(heading, `${base}#${count}`);
	}
	return keys;
}

export function collapsedHeadingKeys(editor) {
	let keys = [];
	for (let [heading, key] of headingKeys(editor))
		if (heading.hasClass("wy-collapsed")) keys.push(key);
	return keys;
}

export function applyCollapsedKeys(editor, keys) {
	let keySet = new Set(keys);
	for (let [heading, key] of headingKeys(editor))
		heading.toggleClass("wy-collapsed", keySet.has(key));
	updateFoldState(editor);
}

export function updateFoldState(editor) {
	let children = childElements(editor);
	children.forEach((heading, r) => {
		let level = headingLevel(heading);
		if (!level) {
			heading.removeClass("wy-collapsed", "wy-foldable");
			return;
		}
		let next = children[r + 1],
			foldable =
				!!next &&
				(headingLevel(next) === 0 || headingLevel(next) > level);
		if ((heading.toggleClass("wy-foldable", foldable), !foldable))
			heading.removeClass("wy-collapsed");
	});
	let collapsedLevel = 0;
	for (let heading of children) {
		let r = headingLevel(heading);
		if (collapsedLevel && (!r || r > collapsedLevel)) {
			heading.addClass("wy-fold-hidden");
			continue;
		}
		heading.removeClass("wy-fold-hidden");
		collapsedLevel = heading.hasClass("wy-collapsed") ? r : 0;
	}
}

export function headingFor(editor, node) {
	let current = node;
	while (current && current.parentNode !== editor)
		current = current.parentNode;
	for (let el = current; el; el = el.previousElementSibling)
		if (el.instanceOf(HTMLElement) && headingLevel(el)) return el;
	return null;
}

export function setHeadingCollapsed(editor, heading, collapsed) {
	heading.toggleClass("wy-collapsed", collapsed);
	updateFoldState(editor);
}

export function setAllCollapsed(editor, collapsed) {
	updateFoldState(editor);
	for (let heading of childElements(editor))
		if (heading.hasClass("wy-foldable"))
			heading.toggleClass("wy-collapsed", collapsed);
	updateFoldState(editor);
}

export function isFoldable(heading) {
	return heading.hasClass("wy-foldable");
}

function foldableLevels(editor) {
	updateFoldState(editor);
	let levels = new Set();
	for (let n of childElements(editor))
		if (n.hasClass("wy-foldable")) levels.add(headingLevel(n));
	return Array.from(levels).sort((n, s) => n - s);
}

export function hasCollapsed(editor) {
	return !!editor.querySelector(":scope > .wy-collapsed");
}

function collapseToLevel(editor, level) {
	updateFoldState(editor);
	for (let heading of childElements(editor)) {
		let headingLevelNumber = headingLevel(heading);
		if (headingLevelNumber)
			heading.toggleClass(
				"wy-collapsed",
				level !== null &&
					headingLevelNumber === level &&
					heading.hasClass("wy-foldable"),
			);
	}
	updateFoldState(editor);
}

export function stepOutlineLevel(editor, expandAll = false) {
	let levels = foldableLevels(editor);
	if (!levels.length) return null;
	if (!hasCollapsed(editor)) {
		let i = levels[0] ?? null;
		collapseToLevel(editor, i);
		return i;
	}
	if (expandAll) {
		collapseToLevel(editor, null);
		return null;
	}
	let minCollapsed = 1 / 0;
	for (let i of childElements(editor))
		if (i.hasClass("wy-collapsed") && !i.hasClass("wy-fold-hidden"))
			minCollapsed = Math.min(minCollapsed, headingLevel(i));
	let nextLevel = levels.find((i) => i > minCollapsed) ?? null;
	collapseToLevel(editor, nextLevel);
	return nextLevel;
}
