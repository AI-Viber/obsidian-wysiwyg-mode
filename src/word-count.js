/**
 * Word and character counts in the status bar while a note is open in WYSIWYG.
 *
 * Obsidian's own counter only reads its Markdown editor, so it disappears in the
 * WYSIWYG view. This one counts the same way (checked against Obsidian's numbers on a
 * real note), so the figures don't change when you switch modes:
 *   - characters: the note's full Markdown text,
 *   - words: runs of text between spaces, where "#" (heading marks) and "/" also
 *     separate words, and each Chinese, Japanese or Korean character is a word.
 * With text selected, the selection is counted instead.
 *
 * While a WYSIWYG note is in front, Obsidian's own counter would still show the last
 * Markdown note's figures without updating, so it is hidden (a class on the body,
 * see styles.css) and comes back as soon as a normal note is in front again.
 */

const HIDE_CORE = "wy-hide-core-word-count";

const CJK = "\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uac00-\\ud7af";
const WORD = new RegExp(`[${CJK}]|[^\\s#/${CJK}]+`, "g");

export function countWords(text) {
	return (text.match(WORD) ?? []).length;
}

const plural = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export class WordCounter {
	/**
	 * @param statusEl status bar item to fill
	 * @param activeView returns the WYSIWYG view in front, or null
	 */
	constructor(statusEl, activeView) {
		this.el = statusEl;
		this.activeView = activeView;
		this.el.addClass("wy-word-count");
		this.words = this.el.createSpan({ cls: "status-bar-item-segment" });
		this.chars = this.el.createSpan({ cls: "status-bar-item-segment" });
		this.timer = 0;
		this.update();
	}

	/** Recount soon; typing calls this on every key, so wait for a pause. */
	updateSoon() {
		window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => this.update(), 250);
	}

	update() {
		window.clearTimeout(this.timer);
		const view = this.activeView();
		if (!view || !view.file) {
			this.el.addClass("wy-hidden");
			document.body.removeClass(HIDE_CORE);
			return;
		}
		document.body.addClass(HIDE_CORE);
		const selected = view.selectedText();
		const text = selected || view.getViewData();
		this.words.setText(plural(countWords(text), "word", "words"));
		this.chars.setText(plural(text.length, "character", "characters"));
		this.el.setAttribute("aria-label", selected ? "Selection" : "Whole note");
		this.el.removeClass("wy-hidden");
	}

	destroy() {
		window.clearTimeout(this.timer);
		document.body.removeClass(HIDE_CORE);
	}
}
