/**
 * Small DOM helpers: HTML sanitising, escaping and execCommand wrappers.
 */

const UNSAFE_TAGS = new Set([
	"SCRIPT",
	"STYLE",
	"LINK",
	"META",
	"BASE",
	"TITLE",
	"HEAD",
	"NOSCRIPT",
	"TEMPLATE",
	"IFRAME",
	"FRAME",
	"FRAMESET",
	"OBJECT",
	"EMBED",
	"APPLET",
	"FORM",
	"DIALOG",
]);

const URL_ATTRIBUTES = new Set([
	"href",
	"src",
	"xlink:href",
	"action",
	"formaction",
	"poster",
	"srcset",
]);

function isSafeUrl(attribute, value, tagName) {
	let compact = Array.from(value)
		.filter((r) => r.charCodeAt(0) > 32)
		.join("")
		.toLowerCase();
	if (compact.startsWith("javascript:") || compact.startsWith("vbscript:"))
		return false;
	if (compact.startsWith("data:"))
		return (
			tagName === "IMG" &&
			attribute === "src" &&
			compact.startsWith("data:image/") &&
			!compact.startsWith("data:image/svg")
		);
	return true;
}

/**
 * Remove scripts, event handlers, unsafe URLs and SVG from parsed HTML.
 */
function sanitizeTree(root) {
	let elements = Array.from(root.querySelectorAll("*"));
	for (let r of elements) {
		if (
			UNSAFE_TAGS.has(r.tagName.toUpperCase()) ||
			r.namespaceURI === "http://www.w3.org/2000/svg"
		) {
			r.remove();
			continue;
		}
		for (let attribute of Array.from(r.attributes)) {
			let name = attribute.name.toLowerCase();
			if (name.startsWith("on")) r.removeAttribute(attribute.name);
			else if (
				URL_ATTRIBUTES.has(name) &&
				!isSafeUrl(name, attribute.value, r.tagName.toUpperCase())
			) {
				if (name === "href")
					r.setAttribute("data-md-href", attribute.value);
				r.removeAttribute(attribute.name);
			}
		}
	}
	let walker = root.ownerDocument?.createTreeWalker(
			root,
			NodeFilter.SHOW_COMMENT,
		),
		comments = [];
	for (let r = walker?.nextNode(); r; r = walker?.nextNode())
		comments.push(r);
	comments.forEach((r) => r.parentNode?.removeChild(r));
}

function parseSafeHtml(html, targetDoc) {
	let parsed = new DOMParser().parseFromString(
		`<!doctype html><body>${html}`,
		"text/html",
	);
	sanitizeTree(parsed.body);
	let fragment = createFragment();
	for (let node of Array.from(parsed.body.childNodes))
		fragment.appendChild(targetDoc.adoptNode(node));
	return fragment;
}

export function setSafeHtml(element, html) {
	element.replaceChildren(parseSafeHtml(html, element.ownerDocument));
}

function sanitizeHtml(html, doc) {
	let container = createDiv();
	container.appendChild(parseSafeHtml(html, doc));
	return container.innerHTML;
}

export function safeInnerHtml(element) {
	return sanitizeHtml(element.innerHTML, element.ownerDocument);
}

export function escapeHtml(text) {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

export function emptyParagraph() {
	let paragraph = createEl("p");
	paragraph.createEl("br");
	return paragraph;
}

export function execCommand(doc, command, value) {
	try {
		return doc.execCommand(command, false, value);
	} catch {
		return false;
	}
}

export function queryCommandState(doc, command) {
	try {
		return doc.queryCommandState(command);
	} catch {
		return false;
	}
}

const BLOCK_TAGS = new Set([
	"P",
	"DIV",
	"H1",
	"H2",
	"H3",
	"H4",
	"H5",
	"H6",
	"UL",
	"OL",
	"LI",
	"BLOCKQUOTE",
	"PRE",
	"HR",
	"TABLE",
	"THEAD",
	"TBODY",
	"TR",
	"TD",
	"TH",
	"SECTION",
	"ARTICLE",
	"HEADER",
	"FOOTER",
	"FIGURE",
	"DL",
	"DT",
	"DD",
	"ADDRESS",
	"ASIDE",
	"NAV",
	"MAIN",
]);

export const isBlockElement = (e) => BLOCK_TAGS.has(e.tagName);

export const isBlockNode = (e) => !!e && e.nodeType === 1 && isBlockElement(e);
