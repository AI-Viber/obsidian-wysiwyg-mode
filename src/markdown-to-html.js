/**
 * Markdown -> HTML for the editor (marked plus Obsidian syntax: wikilinks,
 * embeds, ==highlight==, math, comments, footnotes and #tags).
 */

import { Marked } from "marked";
import { isBlockElement, isBlockNode } from "./dom-utils.js";

export function splitFrontmatter(text) {
	let match = text.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
	if (!match) return { frontmatter: null, body: text };
	return { frontmatter: match[1] ?? "", body: text.slice(match[0].length) };
}

export function joinFrontmatter(frontmatter, body) {
	if (frontmatter === null) return body;
	return `---
${frontmatter}
---
${body}`;
}

const escapeAttribute = (text) =>
	text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");

function rawInlineHtml(raw, display = raw, extraClass = "") {
	return `<span class="wy-raw-inline ${extraClass}" contenteditable="false" data-raw="${escapeAttribute(encodeURIComponent(raw))}">${escapeAttribute(display)}</span>`;
}

function rawBlockHtml(raw, kind) {
	return `<pre class="wy-raw" data-raw-kind="${kind}" spellcheck="false">${escapeAttribute(raw.replace(/\n+$/, ""))}</pre>`;
}

const SIMPLE_INLINE_HTML = /^<\/?(u|sub|sup|kbd|br)\s*\/?>$/i;

function createMarkdownParser(hooks) {
	let extensions = [
			{
				name: "mathBlock",
				level: "block",
				start: (s) => s.match(/^\$\$/m)?.index,
				tokenizer(s) {
					let r = s.match(/^\$\$[\s\S]*?\$\$[ \t]*(?:\n|$)/);
					if (r) return { type: "mathBlock", raw: r[0] };
					return;
				},
				renderer: (s) => rawBlockHtml(s.raw, "math"),
			},
			{
				name: "commentBlock",
				level: "block",
				start: (s) => s.match(/^%%/m)?.index,
				tokenizer(s) {
					let r = s.match(/^%%[\s\S]*?%%[ \t]*(?:\n|$)/);
					if (r) return { type: "commentBlock", raw: r[0] };
					return;
				},
				renderer: (s) => rawBlockHtml(s.raw, "comment"),
			},
			{
				name: "footnoteDef",
				level: "block",
				start: (s) => s.match(/^\[\^[^\]\n]+\]:/m)?.index,
				tokenizer(s) {
					let r = s.match(
						/^\[\^[^\]\n]+\]:[^\n]*(?:\n[ \t]+[^\n]*)*(?:\n|$)/,
					);
					if (r) return { type: "footnoteDef", raw: r[0] };
					return;
				},
				renderer: (s) => rawBlockHtml(s.raw, "footnote"),
			},
			{
				name: "wikiEmbed",
				level: "inline",
				start: (s) => s.indexOf("![["),
				tokenizer(s) {
					let r = s.match(/^!\[\[([^\]\n]+?)\]\]/);
					if (r) return { type: "wikiEmbed", raw: r[0], link: r[1] };
					return;
				},
				renderer(s) {
					let r = String(s.link ?? ""),
						[i = "", o] = r.split("|"),
						l = hooks.resolveEmbed(i);
					if (l) {
						let a =
							o && /^\d+(x\d+)?$/.test(o.trim())
								? ` width="${o.split("x")[0]}"`
								: "";
						return `<img class="wy-embed" data-embed="${escapeAttribute(r)}" src="${escapeAttribute(l)}" alt="${escapeAttribute(i)}"${a}>`;
					}
					return rawInlineHtml(
						s.raw,
						"\uD83D\uDCC4 " + i,
						"wy-embed-note",
					);
				},
			},
			{
				name: "wikiLink",
				level: "inline",
				start: (s) => s.indexOf("[["),
				tokenizer(s) {
					let r = s.match(/^\[\[([^\]\n]+?)\]\]/);
					if (!r) return;
					let i = r[1] ?? "",
						o = i.indexOf("|"),
						l = o >= 0 ? i.slice(0, o) : i,
						a = o >= 0 ? i.slice(o + 1) : "";
					return { type: "wikiLink", raw: r[0], target: l, alias: a };
				},
				renderer(s) {
					let r = String(s.target ?? ""),
						i = String(s.alias ?? ""),
						o = i || r;
					return `<a class="wy-wikilink internal-link" data-target="${escapeAttribute(r)}" data-alias="${escapeAttribute(i)}" data-display="${escapeAttribute(o)}" href="#">${escapeAttribute(o)}</a>`;
				},
			},
			{
				name: "highlight",
				level: "inline",
				start: (s) => s.indexOf("=="),
				tokenizer(s) {
					let r = s.match(/^==(?=\S)([\s\S]*?\S)==/);
					if (r)
						return {
							type: "highlight",
							raw: r[0],
							tokens: this.lexer.inlineTokens(r[1] ?? ""),
						};
					return;
				},
				renderer(s) {
					return `<mark>${this.parser.parseInline(s.tokens ?? [])}</mark>`;
				},
			},
			{
				name: "inlineMath",
				level: "inline",
				start: (s) => s.indexOf("$"),
				tokenizer(s) {
					let r = s.match(/^\$(?=[^\s$])([^$\n]*?[^\s\\])\$(?!\d)/);
					if (r) return { type: "inlineMath", raw: r[0] };
					return;
				},
				renderer: (s) => rawInlineHtml(s.raw, s.raw, "wy-math"),
			},
			{
				name: "inlineComment",
				level: "inline",
				start: (s) => s.indexOf("%%"),
				tokenizer(s) {
					let r = s.match(/^%%[^\n]*?%%/);
					if (r) return { type: "inlineComment", raw: r[0] };
					return;
				},
				renderer: (s) => rawInlineHtml(s.raw, s.raw, "wy-comment"),
			},
			{
				name: "footnoteRef",
				level: "inline",
				start: (s) => s.indexOf("[^"),
				tokenizer(s) {
					let r = s.match(/^\[\^[^\]\s]+\]/);
					if (r) return { type: "footnoteRef", raw: r[0] };
					return;
				},
				renderer: (s) =>
					rawInlineHtml(s.raw, s.raw.slice(2, -1), "wy-footnote"),
			},
			{
				name: "tag",
				level: "inline",
				start(s) {
					let r = s.match(
						/(^|[\s(])#(?=[^\s#\d][^\s#]*|\d*[^\s#\d])/,
					);
					return r && r.index !== undefined
						? r.index + (r[1]?.length ?? 0)
						: undefined;
				},
				tokenizer(s) {
					let r = s.match(
						/^#([^\s!@#$%^&*(),.?":{}|<>\[\]=+;'`~\\]*[^\s!@#$%^&*(),.?":{}|<>\[\]=+;'`~\\\d][^\s!@#$%^&*(),.?":{}|<>\[\]=+;'`~\\]*)/,
					);
					if (r) return { type: "tag", raw: r[0] };
					return;
				},
				renderer: (s) =>
					`<span class="wy-tag">${escapeAttribute(s.raw)}</span>`,
			},
		],
		marked = new Marked({ gfm: true, breaks: true, async: false });
	marked.use({
		extensions: extensions,
		renderer: {
			html(s) {
				let r = s.text;
				if (s.block) return rawBlockHtml(r, "html");
				if (SIMPLE_INLINE_HTML.test(r.trim())) return r;
				return rawInlineHtml(r);
			},
		},
	});
	return marked;
}

let parserCache = null;

/**
 * Parse Markdown to an HTML string using the (cached) configured parser.
 */
export function markdownToHtml(markdown, hooks) {
	if (!parserCache || parserCache.hooks !== hooks)
		parserCache = { hooks: hooks, parser: createMarkdownParser(hooks) };
	return parserCache.parser.parse(markdown);
}

export function postProcessHtml(root) {
	root.querySelectorAll("li").forEach((s) => {
		let r = s.firstElementChild,
			i =
				r?.instanceOf(HTMLInputElement) && r.type === "checkbox"
					? r
					: s.querySelector(
							":scope > p:first-child > input[type=checkbox]:first-child",
						);
		if (i?.instanceOf(HTMLInputElement)) {
			if (i.parentElement !== s) s.insertBefore(i, s.firstChild);
			i.removeAttribute("disabled");
			i.setAttribute("contenteditable", "false");
			i.classList.add("wy-checkbox");
			s.classList.add("wy-task");
			s.classList.toggle("is-checked", i.checked);
			s.parentElement?.classList.add("wy-task-list");
		}
	});
	root.querySelectorAll("blockquote").forEach((s) => {
		let i = (s.textContent?.trimStart() ?? "").match(/^\[!([\w-]+)\]/);
		if (i) {
			s.classList.add("wy-callout");
			s.dataset.callout = (i[1] ?? "").toLowerCase();
		}
	});
	let walker = root.ownerDocument.createTreeWalker(
			root,
			NodeFilter.SHOW_TEXT,
		),
		textNodes = [];
	for (let s = walker.nextNode(); s; s = walker.nextNode()) textNodes.push(s);
	for (let s of textNodes) {
		if (
			s.parentElement?.closest("pre") ||
			!s.data.includes(`
`)
		)
			continue;
		let r = s.parentElement;
		if (
			/^\s*$/.test(s.data) &&
			r &&
			isBlockElement(r) &&
			(!s.previousSibling ||
				!s.nextSibling ||
				isBlockNode(s.previousSibling) ||
				isBlockNode(s.nextSibling))
		)
			s.remove();
		else
			s.data = s.data.replace(/\n/g, (i, o) =>
				o === 0 && s.previousSibling?.nodeName === "BR" ? "" : " ",
			);
	}
	if (!root.firstChild) root.createEl("p").createEl("br");
}
