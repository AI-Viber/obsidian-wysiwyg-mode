/**
 * HTML -> Markdown: turns the edited page back into Markdown for saving.
 */

import { isBlockElement } from "./dom-utils.js";

/**
 * Convert the editor DOM back into Markdown text.
 */
export function htmlToMarkdown(root, options = {}) {
	let context = { indent: options.indent ?? "\t" },
		result = convertBlocks(root, context)
			.join(
				`

`,
			)
			.replace(
				/\n{3,}/g,
				`

`,
			)
			.trimEnd();
	return result
		? result +
				`
`
		: "";
}

function convertBlocks(parent, context) {
	let blocks = [],
		inlineRun = [],
		afterQuote = false,
		flushInline = () => {
			if (!inlineRun.length) return;
			let o = convertInlineRun(inlineRun);
			if (o) blocks.push(o);
			inlineRun = [];
		};
	for (let o of Array.from(parent.childNodes)) {
		if (o.nodeType === 3) {
			if (o.data.trim()) afterQuote = false;
			inlineRun.push(o);
			continue;
		}
		if (o.nodeType !== 1) continue;
		let element = o;
		if (!isBlockElement(element)) {
			afterQuote = false;
			inlineRun.push(element);
			continue;
		}
		flushInline();
		let converted = convertBlock(element, context),
			previous = element.previousElementSibling;
		if (
			element.tagName === "BLOCKQUOTE" &&
			!element.classList.contains("wy-callout") &&
			previous?.tagName === "BLOCKQUOTE" &&
			afterQuote &&
			typeof converted === "string" &&
			converted
		)
			blocks[blocks.length - 1] +=
				`
>
` + converted;
		else if (Array.isArray(converted)) blocks.push(...converted);
		else if (converted) blocks.push(converted);
		afterQuote =
			element.tagName === "BLOCKQUOTE" &&
			!element.classList.contains("wy-callout") &&
			!!converted;
	}
	flushInline();
	return blocks;
}

function convertBlock(element, context) {
	let tag = element.tagName;
	switch (tag) {
		case "H1":
		case "H2":
		case "H3":
		case "H4":
		case "H5":
		case "H6": {
			let s = inlineToMarkdown(Array.from(element.childNodes), false)
				.replace(/\s*\n\s*/g, " ")
				.trim();
			return s ? "#".repeat(Number(tag[1])) + " " + s : "";
		}
		case "UL":
		case "OL":
			return convertList(element, context);
		case "BLOCKQUOTE": {
			let s = convertBlocks(element, context).join(`

`);
			if (!s.trim()) return "";
			return s
				.split(
					`
`,
				)
				.map((r) => (r ? "> " + r : ">")).join(`
`);
		}
		case "PRE": {
			if (element.classList.contains("wy-raw"))
				return preText(element).replace(/\n+$/, "");
			let s = element.querySelector("code"),
				r =
					(s?.className.match(/language-(\S+)/) || [])[1] ||
					element.dataset.lang ||
					"",
				i = preText(s ?? element).replace(/\n$/, ""),
				o = "```";
			while (i.includes(o)) o += "`";
			return `${o}${r}
${i}
${o}`;
		}
		case "HR":
			return "---";
		case "TABLE":
			return convertTable(element);
		case "P":
			if (Array.from(element.children).some((s) => isBlockElement(s)))
				return convertBlocks(element, context);
			return convertInlineRun(Array.from(element.childNodes));
		case "LI":
			return convertBlocks(element, context);
		default: {
			if (!Array.from(element.children).some((r) => isBlockElement(r)))
				return convertInlineRun(Array.from(element.childNodes));
			return convertBlocks(element, context);
		}
	}
}

function convertInlineRun(nodes) {
	return inlineToMarkdown(nodes, true)
		.split(
			`
`,
		)
		.map((n) => n.replace(/^[ \t]+/, "").replace(/[ \t]+$/, ""))
		.join(
			`
`,
		)
		.replace(/^\n+|\n+$/g, "");
}

function convertList(list, context) {
	let ordered = list.tagName === "OL",
		counter = ordered ? Number(list.getAttribute("start") || 1) : 1,
		lines = [],
		entries = [];
	for (let li of Array.from(list.children))
		if (li.tagName === "LI") entries.push({ li: li, extra: [] });
		else if (li.tagName === "UL" || li.tagName === "OL") {
			let nested = entries[entries.length - 1];
			if (nested) nested.extra.push(li);
			else entries.push({ li: null, extra: [li] });
		}
	for (let { li: li, extra: nested } of entries) {
		let a = ordered ? `${counter}.` : "-",
			children = [];
		if (li) {
			let g = li.querySelector(":scope > input[type=checkbox]");
			if (g) a += g.checked ? " [x]" : " [ ]";
			children = convertBlocks(li, context);
		}
		for (let g of nested) children.push(convertList(g, context));
		if (!li) {
			lines.push(
				children.map((g) => indentLines(g, context.indent, true)).join(`
`),
			);
			continue;
		}
		let [first = "", ...rest] = children,
			firstLines = first.split(`
`),
			itemText = `${a} ${firstLines[0]}`.trimEnd();
		if (firstLines.length > 1)
			itemText +=
				`
` +
				indentLines(
					firstLines.slice(1).join(`
`),
					context.indent,
					true,
				);
		for (let g of rest) {
			let x = /^([-+*]|\d+[.)])(\s|$)/.test(g);
			itemText +=
				(x
					? `
`
					: `

`) + indentLines(g, context.indent, true);
		}
		lines.push(itemText);
		counter++;
	}
	return lines.join(`
`);
}

function indentLines(text, indent, includeFirst) {
	return text
		.split(
			`
`,
		)
		.map((line, index) =>
			line && (includeFirst || index > 0) ? indent + line : line,
		).join(`
`);
}

function convertTable(table) {
	let rows = Array.from(table.querySelectorAll("tr")).filter(
		(l) => l.closest("table") === table,
	);
	if (!rows.length) return "";
	let cells = rows.map((l) =>
			Array.from(l.children)
				.filter((a) => a.tagName === "TD" || a.tagName === "TH")
				.map((a) =>
					inlineToMarkdown(Array.from(a.childNodes), false)
						.replace(/\n/g, "<br>")
						.replace(/\|/g, "\\|")
						.trim(),
				),
		),
		columnCount = Math.max(...cells.map((l) => l.length)),
		headerCells = Array.from(rows[0]?.children ?? []),
		alignments = Array.from({ length: columnCount }, (l, a) => {
			let c = headerCells[a],
				h = c?.getAttribute("align") || c?.style.textAlign || "";
			return h === "center"
				? ":---:"
				: h === "right"
					? "---:"
					: h === "left"
						? ":---"
						: "---";
		}),
		renderRow = (l) =>
			"| " +
			Array.from({ length: columnCount }, (a, c) => l[c] ?? "").join(
				" | ",
			) +
			" |";
	return [
		renderRow(cells[0] ?? []),
		"| " + alignments.join(" | ") + " |",
		...cells.slice(1).map(renderRow),
	].join(`
`);
}

function preText(element) {
	let text = "",
		visit = (node) => {
			if (node.nodeType === 3) {
				text += node.data;
				return;
			}
			if (node.nodeType !== 1) return;
			let el = node;
			if (el.tagName === "BR") {
				text += `
`;
				return;
			}
			if (
				(el.tagName === "DIV" || el.tagName === "P") &&
				text &&
				!text.endsWith(`
`)
			)
				text += `
`;
			el.childNodes.forEach(visit);
		};
	element.childNodes.forEach(visit);
	return text.replace(/\u00a0/g, " ");
}

function inlineFormatOf(element) {
	switch (element.tagName) {
		case "B":
		case "STRONG":
			return "strong";
		case "I":
		case "EM":
		case "CITE":
		case "DFN":
			return "em";
		case "U":
		case "INS":
			return "u";
		case "S":
		case "DEL":
		case "STRIKE":
			return "s";
		case "MARK":
			return "mark";
		case "CODE":
		case "TT":
		case "SAMP":
			return element.closest("pre") ? null : "code";
	}
	return null;
}

function styleFormatsOf(element) {
	let style = element.style;
	if (!style || !element.getAttribute("style")) return [];
	let formats = [],
		weight = style.fontWeight;
	if (weight === "bold" || weight === "bolder" || Number(weight) >= 600)
		formats.push("strong");
	if (style.fontStyle === "italic") formats.push("em");
	let decoration = style.textDecoration || style.textDecorationLine || "";
	if (decoration.includes("underline")) formats.push("u");
	if (decoration.includes("line-through")) formats.push("s");
	return formats;
}

function inlineToMarkdown(nodes, lineStart) {
	let plainText = nodes.map((r) => r.textContent || "").join(""),
		context = {
			lineStart: lineStart,
			dollarCount: (plainText.match(/\$/g) || []).length,
		};
	return convertInlineNodes(nodes, context)
		.replace(/\u00a0/g, " ")
		.replace(/\u200b/g, "");
}

function convertInlineNodes(nodes, context) {
	let out = "",
		index = 0;
	while (index < nodes.length) {
		let node = nodes[index];
		if (!node) break;
		if (node.nodeType === 1) {
			let format = inlineFormatOf(node);
			if (format && format !== "code") {
				let grouped = [],
					end = index;
				for (
					let sibling = nodes[end];
					sibling &&
					sibling.nodeType === 1 &&
					inlineFormatOf(sibling) === format;
					sibling = nodes[end]
				) {
					grouped.push(...Array.from(sibling.childNodes));
					end++;
				}
				out += wrapFormat(format, grouped, context);
				index = end;
				continue;
			}
		}
		out += convertInlineNode(node, context);
		index++;
	}
	return out;
}

const FORMAT_MARKERS = {
	strong: ["**", "**"],
	em: ["*", "*"],
	u: ["<u>", "</u>"],
	s: ["~~", "~~"],
	mark: ["==", "=="],
};

function wrapFormat(format, children, context) {
	let wasLineStart = context.lineStart;
	context.lineStart = false;
	let inner = convertInlineNodes(children, context),
		parts = inner.match(/^(\s*)([\s\S]*?)(\s*)$/);
	if (!parts[2]) {
		context.lineStart = wasLineStart && !inner;
		return inner;
	}
	let [open, close] = FORMAT_MARKERS[format];
	return parts[1] + open + parts[2] + close + parts[3];
}

function convertInlineNode(node, context) {
	if (node.nodeType === 3) {
		let o = node.data.replace(/[\r\n\t ]+/g, " ");
		if (!o) return "";
		let l = escapeMarkdownText(o, context);
		if (l.trim()) context.lineStart = false;
		return l;
	}
	if (node.nodeType !== 1) return "";
	let element = node,
		tag = element.tagName;
	if (element.classList.contains("wy-raw-inline")) {
		context.lineStart = false;
		return safeDecodeURI(element.dataset.raw || "");
	}
	switch (tag) {
		case "BR":
			context.lineStart = true;
			return `
`;
		case "INPUT":
		case "SCRIPT":
		case "STYLE":
		case "TEMPLATE":
			return "";
		case "CODE":
		case "TT":
		case "SAMP": {
			let o = (element.textContent || "")
				.replace(/\u00a0/g, " ")
				.replace(/\u200b/g, "");
			if (!o) return "";
			context.lineStart = false;
			let a = (o.match(/`+/g) || []).reduce(
					(p, d) => Math.max(p, d.length),
					0,
				),
				c = "`".repeat(a + 1),
				h = o.startsWith("`") || o.endsWith("`") ? " " : "";
			return c + h + o + h + c;
		}
		case "A": {
			if (element.classList.contains("wy-wikilink")) {
				let d = element.dataset.target || "",
					f = (element.textContent || "").replace(/\u00a0/g, " ");
				if (!f.trim()) return "";
				if (
					((context.lineStart = false), f === element.dataset.display)
				)
					return element.dataset.alias
						? `[[${d}|${element.dataset.alias}]]`
						: `[[${d}]]`;
				return f === d ? `[[${d}]]` : `[[${d}|${f}]]`;
			}
			let o =
					element.dataset.mdHref ||
					element.getAttribute("href") ||
					"",
				l = context.lineStart;
			context.lineStart = false;
			let a = convertInlineNodes(Array.from(element.childNodes), context);
			if (!o || o === "#") {
				context.lineStart = l && !a;
				return a;
			}
			let c = element.textContent || "";
			if (c === o && /^https?:\/\/\S+$/.test(o)) return o;
			if (o.startsWith("mailto:") && c === o.slice(7))
				return `<${o.slice(7)}>`;
			let h = element.getAttribute("title"),
				p = /[\s()<>]/.test(o)
					? `<${o.replace(/[<>]/g, encodeURIComponent)}>`
					: o;
			return `[${a || c}](${p}${h ? ` "${h.replace(/"/g, '\\"')}"` : ""})`;
		}
		case "IMG": {
			if (
				((context.lineStart = false),
				element.classList.contains("wy-embed"))
			)
				return `![[${element.dataset.embed}]]`;
			let o = element.dataset.mdSrc || element.getAttribute("src") || "";
			if (!o) return "";
			let l = (element.getAttribute("alt") || "").replace(/[\[\]]/g, ""),
				a = element.getAttribute("width"),
				c = /[\s()]/.test(o) ? `<${o}>` : o,
				h = element.getAttribute("title");
			return `![${l}${a ? "|" + a : ""}](${c}${h ? ` "${h.replace(/"/g, '\\"')}"` : ""})`;
		}
		case "SUP":
		case "SUB":
		case "KBD": {
			let o = tag.toLowerCase();
			context.lineStart = false;
			return `<${o}>${convertInlineNodes(Array.from(element.childNodes), context)}</${o}>`;
		}
	}
	let format = inlineFormatOf(element);
	if (format && format !== "code")
		return wrapFormat(format, Array.from(element.childNodes), context);
	let styleFormats = styleFormatsOf(element);
	if (styleFormats.length) {
		let o = Array.from(element.childNodes),
			l = (a) => {
				let c = styleFormats[a];
				return c
					? wrapStyleFormat(c, () => l(a + 1), context)
					: convertInlineNodes(o, context);
			};
		return l(0);
	}
	if (isBlockElement(element)) {
		let o = convertInlineNodes(Array.from(element.childNodes), context);
		return o
			? `
` +
					o +
					`
`
			: "";
	}
	return convertInlineNodes(Array.from(element.childNodes), context);
}

function wrapStyleFormat(format, render, context) {
	context.lineStart = false;
	let inner = render(),
		parts = inner.match(/^(\s*)([\s\S]*?)(\s*)$/);
	if (!parts[2]) return inner;
	let [open, close] = FORMAT_MARKERS[format];
	return parts[1] + open + parts[2] + close + parts[3];
}

function safeDecodeURI(text) {
	try {
		return decodeURIComponent(text);
	} catch {
		return text;
	}
}

function escapeMarkdownText(text, context) {
	let escaped = text
		.replace(/\\(?=[!-\/:-@\[-`{-~])/g, "\\\\")
		.replace(/[*`]/g, "\\$&")
		.replace(/(^|[^\p{L}\p{N}])_|_(?=$|[^\p{L}\p{N}])/gu, (s) =>
			s.replace("_", "\\_"),
		)
		.replace(/\[(?=\[|\^)/g, "\\[")
		.replace(/\](?=\()/g, "\\]")
		.replace(/==/g, "\\=\\=")
		.replace(/~~/g, "\\~\\~")
		.replace(/%%/g, "\\%\\%")
		.replace(/<(?=[A-Za-z\/!?])/g, "\\<")
		.replace(/&(?=#?[A-Za-z0-9]+;)/g, "\\&")
		.replace(/(^|\s)#(?=\s|$)/g, "$1#");
	if (context.dollarCount >= 2) escaped = escaped.replace(/\$/g, "\\$");
	if (context.lineStart) {
		let s = escaped.match(/^\s*/)[0],
			r = escaped.slice(s.length);
		if (/^#{1,6}(\s|$)/.test(r)) r = "\\" + r;
		else if (/^>/.test(r)) r = "\\" + r;
		else if (
			/^[-+](\s|$)/.test(r) ||
			/^-{2,}\s*$/.test(r) ||
			/^={2,}\s*$/.test(r)
		)
			r = "\\" + r;
		else if (/^\d{1,9}[.)](\s|$)/.test(r))
			r = r.replace(/^(\d+)([.)])/, "$1\\$2");
		else if (/^\|/.test(r)) r = "\\" + r;
		escaped = s + r;
	}
	return escaped;
}
