/**
 * Live #tag styling while typing.
 */

const TAG_PATTERN = new RegExp(
	"^#[^\\s!@#$%^&*(),.?\":{}|<>\\[\\]=+;'`~\\\\]+$",
);

const TAG_SCAN_PATTERN = new RegExp(
	"(^|[\\s(\\u200b])(#[^\\s!@#$%^&*(),.?\":{}|<>\\[\\]=+;'`~\\\\]+)",
	"g",
);

function isValidTag(text) {
	return TAG_PATTERN.test(text) && !/^#\d+$/.test(text);
}

function textNodesOf(root) {
	let nodes = [],
		walker = root.ownerDocument?.createTreeWalker(
			root,
			NodeFilter.SHOW_TEXT,
		);
	for (let node = walker?.nextNode(); node; node = walker?.nextNode())
		nodes.push(node);
	return nodes;
}

function caretOffset(root, selection) {
	if (
		!selection ||
		!selection.rangeCount ||
		!selection.isCollapsed ||
		!root.contains(selection.anchorNode)
	)
		return null;
	let range = root.ownerDocument.createRange();
	range.setStart(root, 0);
	range.setEnd(selection.anchorNode, selection.anchorOffset);
	return range.toString().length;
}

function restoreCaretOffset(root, offset, selection) {
	let remaining = offset;
	for (let textNode of textNodesOf(root)) {
		if (remaining <= textNode.data.length) {
			let range = root.ownerDocument.createRange();
			range.setStart(textNode, remaining);
			range.collapse(true);
			selection.removeAllRanges();
			selection.addRange(range);
			return;
		}
		remaining -= textNode.data.length;
	}
}

export function styleLiveTags(block, selection) {
	let caret = caretOffset(block, selection),
		changed = false;
	for (let i of Array.from(block.querySelectorAll("span.wy-tag"))) {
		if (isValidTag(i.textContent ?? "")) continue;
		i.replaceWith(...Array.from(i.childNodes));
		changed = true;
	}
	if (changed) block.normalize();
	let runningOffset = 0;
	for (let i of textNodesOf(block)) {
		let nodeStart = runningOffset;
		runningOffset += i.data.length;
		let parent = i.parentElement;
		if (
			!parent ||
			parent.closest("a, code, pre, .wy-raw-inline, .wy-raw") ||
			parent.closest("span.wy-tag")
		)
			continue;
		TAG_SCAN_PATTERN.lastIndex = 0;
		let match,
			ranges = [];
		while ((match = TAG_SCAN_PATTERN.exec(i.data))) {
			let h = match[2] ?? "",
				p = match.index + (match[1]?.length ?? 0),
				d = p + h.length;
			if (
				caret !== null &&
				caret >= nodeStart + p &&
				caret <= nodeStart + d
			)
				continue;
			if (isValidTag(h)) ranges.push({ from: p, to: d });
		}
		for (let { from: h, to: p } of ranges.reverse()) {
			let d = i.splitText(h);
			d.splitText(p - h);
			let f = createSpan({ cls: "wy-tag" });
			d.replaceWith(f);
			f.appendChild(d);
			changed = true;
		}
	}
	if (changed && caret !== null && selection)
		restoreCaretOffset(block, caret, selection);
	return changed;
}
