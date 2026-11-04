/**
 * The WYSIWYG editor view: a contenteditable page with a formatting toolbar.
 * Notes are shown as rich text and saved back as Markdown.
 */

import {
	Notice,
	Platform,
	TFile,
	TextFileView,
	finishRenderMath,
	renderMath,
	setIcon,
} from "obsidian";
import { createFolderChip, updateFolderChip } from "./folder-label.js";
import { updateFoldButton } from "./header-buttons.js";
import { findCommandForKeyEvent, isEditorCommand } from "./hotkeys.js";
import { runEditorCommand } from "./editor-adapter.js";
import {
	emptyParagraph,
	escapeHtml,
	execCommand,
	queryCommandState,
	safeInnerHtml,
	setSafeHtml,
} from "./dom-utils.js";
import {
	joinFrontmatter,
	markdownToHtml,
	postProcessHtml,
	splitFrontmatter,
} from "./markdown-to-html.js";
import { htmlToMarkdown } from "./html-to-markdown.js";
import {
	COLLAPSED_CLASS,
	applyCollapsedKeys,
	collapsedHeadingKeys,
	hasCollapsed,
	headingFor,
	headingLevel,
	isFoldable,
	setAllCollapsed,
	setHeadingCollapsed,
	stepOutlineLevel,
	updateFoldState,
} from "./folding.js";
import { styleLiveTags } from "./tags.js";
import { LinkModal, NoteSuggestModal } from "./modals.js";

export const VIEW_TYPE = "wysiwyg-mode-view";

const IMAGE_EXTENSIONS = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"bmp",
	"svg",
	"webp",
	"avif",
]);

export class WysiwygView extends TextFileView {
	plugin;
	wyEditor;
	wyTitleInput;
	wyTitleRow;
	wyFolderChip = null;
	wyFoldButton = null;
	wyToolbar;
	wyBlockSelect;
	wyFmDetails;
	wyFmTextarea;
	wyButtons = [];
	wyFrontmatter = null;
	wyDirty = false;
	wyLastRange = null;
	wyEditedBlock = null;
	wyHooks;
	constructor(leaf, plugin) {
		super(leaf);
		this.plugin = plugin;
		this.navigation = true;
		this.wyHooks = {
			resolveEmbed: (linktext) => {
				let file = this.resolveLink(linktext);
				return file &&
					IMAGE_EXTENSIONS.has(file.extension.toLowerCase())
					? this.app.vault.getResourcePath(file)
					: null;
			},
		};
	}
	getViewType() {
		return VIEW_TYPE;
	}
	getDisplayText() {
		return this.file?.basename ?? "WYSIWYG";
	}
	getIcon() {
		return "pen-line";
	}
	canAcceptExtension(extension) {
		return extension === "md";
	}
	get doc() {
		return this.containerEl.doc;
	}
	get win() {
		return this.containerEl.win;
	}
	selection() {
		return this.doc.getSelection();
	}
	async onOpen() {
		let content = this.contentEl;
		content.empty();
		content.addClass("wy-root");
		this.addAction(
			"file-code",
			"Show this note as Markdown",
			() => void this.plugin.mode.showMarkdownFor(this.leaf),
		);
		let headerButton = this.addAction(
			"pen-line",
			this.plugin.mode.toggleTip(),
			() => void this.plugin.mode.setEnabled(false),
		);
		headerButton.addClass("wy-header-wysiwyg", "is-active");
		this.registerDomEvent(headerButton, "mouseenter", () =>
			headerButton.setAttribute(
				"aria-label",
				this.plugin.mode.toggleTip(),
			),
		);
		this.wyFoldButton = this.addAction(
			"chevrons-down-up",
			"Collapse all headings",
			(r) => this.outlineStep(r.altKey),
		);
		this.wyToolbar = content.createDiv({ cls: "wy-toolbar" });
		let page = content
			.createDiv({ cls: "wy-scroller" })
			.createDiv({ cls: "wy-page" });
		if (
			((this.wyTitleRow = page.createDiv({ cls: "wy-title-row" })),
			(this.wyTitleInput = this.wyTitleRow.createEl("input", {
				cls: "wy-title",
				attr: {
					type: "text",
					spellcheck: "false",
					placeholder: "Untitled",
				},
			})),
			this.registerDomEvent(this.wyTitleInput, "keydown", (r) => {
				if (r.key === "Enter" || r.key === "ArrowDown") {
					r.preventDefault();
					this.placeCaretAtStart();
				}
			}),
			this.registerDomEvent(
				this.wyTitleInput,
				"change",
				() => void this.renameFromTitle(),
			),
			(this.wyFmDetails = page.createEl("details", {
				cls: "wy-frontmatter",
			})),
			this.wyFmDetails.createEl("summary", { text: "Properties" }),
			(this.wyFmTextarea = this.wyFmDetails.createEl("textarea", {
				attr: { spellcheck: "false", rows: "4" },
			})),
			this.registerDomEvent(this.wyFmTextarea, "input", () => {
				this.wyFrontmatter = this.wyFmTextarea.value;
				this.markDirty();
			}),
			(this.wyEditor = page.createDiv({
				cls: "wy-editor markdown-rendered",
				attr: {
					contenteditable: "true",
					spellcheck: "true",
					role: "textbox",
					"aria-multiline": "true",
				},
			})),
			this.buildToolbar(),
			this.applySettings(),
			this.registerEvent(
				this.app.workspace.on("css-change", () =>
					this.syncHeadingStyles(),
				),
			),
			this.registerEvent(
				this.app.vault.on("rename", (r) => {
					if (!(r instanceof TFile) || r !== this.file) return;
					if (this.doc.activeElement !== this.wyTitleInput)
						this.wyTitleInput.value = r.basename;
					this.updateFolderLabel();
				}),
			),
			this.registerDomEvent(this.wyEditor, "input", () => this.onEdit()),
			this.registerDomEvent(
				this.win,
				"keydown",
				(r) => {
					if (this.wyEditor.contains(this.doc.activeElement))
						this.onKeyDown(r);
				},
				{ capture: true },
			),
			this.registerDomEvent(this.wyEditor, "paste", (r) =>
				this.onPaste(r),
			),
			this.registerDomEvent(this.wyEditor, "click", (r) =>
				this.onClick(r),
			),
			this.registerDomEvent(this.wyEditor, "mousedown", (r) =>
				this.onFoldArrow(r),
			),
			this.registerDomEvent(this.wyEditor, "focus", () => {
				execCommand(this.doc, "defaultParagraphSeparator", "p");
				execCommand(this.doc, "styleWithCSS", "false");
			}),
			this.registerDomEvent(this.doc, "selectionchange", () => {
				let r = this.selection();
				if (r && r.rangeCount && this.wyEditor.contains(r.anchorNode)) {
					this.wyLastRange = r.getRangeAt(0).cloneRange();
					this.updateToolbar();
				}
				let i = this.wyEditedBlock;
				if (i && !i.contains(r?.anchorNode ?? null)) {
					if (
						((this.wyEditedBlock = null),
						i.isConnected && styleLiveTags(i, r))
					)
						this.markDirty();
				}
			}),
			typeof this.data === "string" && this.data)
		)
			this.setViewData(this.data, true);
		else this.clear();
	}
	applySettings() {
		if (!this.wyToolbar) return;
		let settings = this.plugin.settings;
		this.contentEl.toggleClass("wy-paper", settings.pageStyle === "paper");
		this.contentEl.setCssProps({
			"--wy-page-width": `${settings.pageWidth}px`,
		});
		this.wyToolbar.toggleClass("wy-hidden", !settings.showToolbar);
		this.wyTitleRow.toggleClass(
			"wy-hidden",
			!settings.showTitle && !settings.showFolder,
		);
		this.wyTitleInput.toggleClass("wy-hidden", !settings.showTitle);
		this.updateFolderLabel();
		this.syncHeadingStyles();
	}
	syncHeadingStyles() {
		let content = this.contentEl,
			probe = content.createDiv({
				cls: "wy-probe markdown-source-view mod-cm6 is-live-preview is-readable-line-width",
			});
		probe.setAttribute("aria-hidden", "true");
		let cmContent = probe
				.createDiv({ cls: "cm-editor" })
				.createDiv({ cls: "cm-scroller" })
				.createDiv({ cls: "cm-sizer" })
				.createDiv({ cls: "cm-contentContainer" })
				.createDiv({ cls: "cm-content" }),
			sampleLine = cmContent.createDiv({ cls: "cm-line" });
		sampleLine.setText("x");
		let values = {},
			properties = [
				"color",
				"font-size",
				"font-weight",
				"font-family",
				"font-style",
				"font-variant",
				"letter-spacing",
				"text-transform",
				"text-decoration-line",
			];
		try {
			let baseFontSize =
				parseFloat(this.win.getComputedStyle(sampleLine).fontSize) ||
				16;
			for (let level = 1; level <= 6; level++) {
				let heading = cmContent
					.createDiv({
						cls: `cm-line HyperMD-header HyperMD-header-${level}`,
					})
					.createSpan({ cls: `cm-header cm-header-${level}` });
				heading.setText("Heading");
				let style = this.win.getComputedStyle(heading);
				for (let property of properties) {
					let value = style.getPropertyValue(property);
					if (property === "font-size")
						value = `${(parseFloat(value) / baseFontSize).toFixed(3)}em`;
					values[`--wy-h${level}-${property}`] = value;
				}
			}
		} finally {
			probe.remove();
		}
		content.setCssProps(values);
	}
	getViewData() {
		if (!this.wyDirty || !this.wyEditor) return this.data;
		let markdown = htmlToMarkdown(this.wyEditor, {
			indent: this.plugin.settings.useTabs ? "\t" : "    ",
		});
		this.data = joinFrontmatter(this.wyFrontmatter, markdown);
		return this.data;
	}
	setViewData(data, force) {
		if (!force && this.wyDirty && data === this.getViewData()) return;
		this.data = data;
		this.wyDirty = false;
		let { frontmatter: frontmatter, body: body } = splitFrontmatter(data);
		if (((this.wyFrontmatter = frontmatter), !this.wyEditor)) return;
		this.wyFmTextarea.value = frontmatter ?? "";
		this.wyFmDetails.toggleClass("wy-hidden", frontmatter === null);
		this.wyTitleInput.value = this.file?.basename ?? "";
		this.render(body);
	}
	clear() {
		if (
			((this.wyDirty = false), (this.wyFrontmatter = null), this.wyEditor)
		)
			this.wyEditor.replaceChildren(emptyParagraph());
	}
	async onLoadFile(file) {
		if ((await super.onLoadFile(file), this.wyTitleInput))
			this.wyTitleInput.value = file.basename;
		this.updateFolderLabel();
	}
	render(markdown) {
		setSafeHtml(this.wyEditor, markdownToHtml(markdown, this.wyHooks));
		postProcessHtml(this.wyEditor);
		this.resolveRelativeImages(this.wyEditor);
		this.renderInlineMath(this.wyEditor);
		applyCollapsedKeys(
			this.wyEditor,
			this.file ? this.plugin.getFolds(this.file.path) : [],
		);
		this.updateToolbar();
	}
	saveFolds() {
		if ((this.updateFoldButton(), this.file))
			this.plugin.setFolds(
				this.file.path,
				collapsedHeadingKeys(this.wyEditor),
			);
	}
	onFoldArrow(event) {
		let target = event.target;
		if (
			!target?.instanceOf(HTMLElement) ||
			target.parentElement !== this.wyEditor
		)
			return;
		if (!headingLevel(target) || !isFoldable(target)) return;
		if (event.clientX >= target.getBoundingClientRect().left) return;
		event.preventDefault();
		this.toggleFold(target);
	}
	toggleFold(heading, force) {
		let selection = this.selection(),
			target =
				heading ??
				headingFor(this.wyEditor, selection?.anchorNode ?? null);
		if (!target) return;
		let collapse = force ?? !target.hasClass(COLLAPSED_CLASS);
		if (
			(setHeadingCollapsed(this.wyEditor, target, collapse),
			collapse && this.selectionHidden())
		)
			this.placeCaretAtEndOf(target);
		this.saveFolds();
	}
	outlineStep(expandAll = false) {
		if (
			(stepOutlineLevel(this.wyEditor, expandAll), this.selectionHidden())
		) {
			let selection = this.selection(),
				heading = headingFor(
					this.wyEditor,
					selection?.anchorNode ?? null,
				);
			while (heading?.hasClass("wy-fold-hidden"))
				heading = heading.previousElementSibling;
			if (heading?.instanceOf(HTMLElement))
				this.placeCaretAtEndOf(heading);
		}
		this.saveFolds();
	}
	updateFoldButton() {
		if (this.wyFoldButton && this.wyEditor)
			updateFoldButton(this.wyFoldButton, !hasCollapsed(this.wyEditor));
	}
	foldAll(collapse) {
		setAllCollapsed(this.wyEditor, collapse);
		let selection = this.selection();
		if (collapse && this.selectionHidden()) {
			let heading = headingFor(
				this.wyEditor,
				selection?.anchorNode ?? null,
			);
			while (heading?.hasClass("wy-fold-hidden"))
				heading = heading.previousElementSibling;
			if (heading?.instanceOf(HTMLElement))
				this.placeCaretAtEndOf(heading);
		}
		this.saveFolds();
	}
	selectionHidden() {
		let anchor = this.selection()?.anchorNode ?? null;
		return !!(
			anchor && (anchor.nodeType === 1 ? anchor : anchor.parentElement)
		)?.closest(".wy-fold-hidden");
	}
	placeCaretAtEndOf(element) {
		let range = this.doc.createRange();
		range.selectNodeContents(element);
		range.collapse(false);
		let selection = this.selection();
		selection?.removeAllRanges();
		selection?.addRange(range);
	}
	renderInlineMath(root) {
		let nodes = root.querySelectorAll(".wy-raw-inline.wy-math");
		if (!nodes.length) return;
		try {
			nodes.forEach((el) => {
				let tex = decodeURIComponent(el.dataset.raw ?? "").replace(
						/^\$|\$$/g,
						"",
					),
					rendered = renderMath(tex, false);
				el.empty();
				el.appendChild(rendered);
				el.setAttribute("title", "$" + tex + "$");
				el.addClass("is-rendered");
			});
			finishRenderMath();
		} catch {}
	}
	resolveRelativeImages(root) {
		root.querySelectorAll("img:not(.wy-embed)").forEach((t) => {
			let img = t,
				src = img.getAttribute("src") || "";
			if (!src || /^(https?|data|app|file|blob|capacitor):/i.test(src))
				return;
			let file = this.resolveLink(decodeURI(src));
			if (file) {
				img.dataset.mdSrc = src;
				img.src = this.app.vault.getResourcePath(file);
			}
		});
	}
	resolveLink(link) {
		let linkpath = (link.split("#")[0] ?? "").split("|")[0]?.trim() ?? "";
		return this.app.metadataCache.getFirstLinkpathDest(
			linkpath,
			this.file?.path ?? "",
		);
	}
	markDirty() {
		this.wyDirty = true;
		this.requestSave();
	}
	onEdit() {
		if (
			(this.normalizeTaskLists(),
			this.updateLiveTags(),
			updateFoldState(this.wyEditor),
			this.wyEditor.querySelector(`.${COLLAPSED_CLASS}`))
		)
			this.saveFolds();
		if (!this.wyEditor.firstChild)
			this.wyEditor.replaceChildren(emptyParagraph());
		this.markDirty();
		this.updateToolbar();
	}
	updateLiveTags() {
		let selection = this.selection(),
			block =
				this.currentBlock() ?? this.closestInSelection("blockquote");
		if (!block) return;
		styleLiveTags(block, selection);
		let previous = block.previousElementSibling;
		if (previous?.instanceOf(HTMLElement) && !previous.closest("pre"))
			styleLiveTags(previous, selection);
		this.wyEditedBlock = block;
	}
	updateFolderLabel() {
		if (!this.wyTitleRow) return;
		let file = this.file;
		if (!file || !this.plugin.settings.showFolder) {
			this.wyFolderChip?.remove();
			this.wyFolderChip = null;
			return;
		}
		if (this.wyFolderChip) updateFolderChip(this.wyFolderChip, file);
		else
			this.wyFolderChip = this.wyTitleRow.appendChild(
				createFolderChip(this.app, file),
			);
	}
	async renameFromTitle() {
		let file = this.file,
			newName = this.wyTitleInput.value.trim().replace(/[\\/:]/g, "-");
		if (!file || !newName || newName === file.basename) {
			if (file) this.wyTitleInput.value = file.basename;
			return;
		}
		let folderPrefix =
			file.parent && file.parent.path !== "/"
				? file.parent.path + "/"
				: "";
		try {
			await this.app.fileManager.renameFile(
				file,
				`${folderPrefix}${newName}.md`,
			);
		} catch (error) {
			new Notice(`Could not rename: ${error.message}`);
			this.wyTitleInput.value = file.basename;
		}
	}
	buildToolbar() {
		let toolbar = this.wyToolbar,
			modifierPrefix = Platform.isMacOS ? "⌘" : "Ctrl+",
			tip = (p, d) =>
				`${p} (${Platform.isMacOS ? d.replace(/^(⇧?)/, "$1⌘") : modifierPrefix + d.replace("⇧", "Shift+")})`,
			addGroup = () => toolbar.createDiv({ cls: "wy-group" }),
			historyGroup = addGroup();
		this.addButton(historyGroup, "undo-2", tip("Undo", "Z"), () =>
			this.exec("undo"),
		);
		this.addButton(historyGroup, "redo-2", tip("Redo", "⇧Z"), () =>
			this.exec("redo"),
		);
		let blockGroup = addGroup();
		this.wyBlockSelect = blockGroup.createEl("select", {
			cls: "dropdown wy-block-select",
			attr: { "aria-label": "Paragraph style" },
		});
		let blockTypes = [
			["p", "Normal text"],
			["h1", "Heading 1"],
			["h2", "Heading 2"],
			["h3", "Heading 3"],
			["h4", "Heading 4"],
			["h5", "Heading 5"],
			["h6", "Heading 6"],
			["blockquote", "Quote"],
			["pre", "Code block"],
		];
		for (let [p, d] of blockTypes)
			this.wyBlockSelect.createEl("option", { value: p, text: d });
		this.registerDomEvent(this.wyBlockSelect, "change", () => {
			this.setBlock(toBlockType(this.wyBlockSelect.value));
			this.wyEditor.focus();
		});
		let formatGroup = addGroup();
		this.addButton(
			formatGroup,
			"bold",
			tip("Bold", "B"),
			() => this.exec("bold"),
			() => this.queryState("bold"),
		);
		this.addButton(
			formatGroup,
			"italic",
			tip("Italic", "I"),
			() => this.exec("italic"),
			() => this.queryState("italic"),
		);
		this.addButton(
			formatGroup,
			"underline",
			tip("Underline", "U"),
			() => this.exec("underline"),
			() => this.queryState("underline"),
		);
		this.addButton(
			formatGroup,
			"strikethrough",
			tip("Strikethrough", "⇧X"),
			() => this.exec("strikeThrough"),
			() => this.queryState("strikeThrough"),
		);
		this.addButton(
			formatGroup,
			"highlighter",
			tip("Highlight", "⇧Y"),
			() => this.toggleInline("mark"),
			() => !!this.closestInSelection("mark"),
		);
		this.addButton(
			formatGroup,
			"code",
			tip("Inline code", "E"),
			() => this.toggleInline("code"),
			() => !!this.closestInSelection("code:not(pre code)"),
		);
		this.addButton(
			formatGroup,
			"remove-formatting",
			tip("Clear formatting", "\\"),
			() => this.clearFormatting(),
		);
		let linkGroup = addGroup();
		this.addButton(linkGroup, "link", tip("Link", "K"), () =>
			this.insertExternalLink(),
		);
		this.addButton(
			linkGroup,
			"file-symlink",
			tip("Link to note", "⇧K"),
			() => this.insertNoteLink(),
		);
		this.addButton(linkGroup, "image", "Insert image from vault", () =>
			this.insertImage(),
		);
		let listGroup = addGroup();
		this.addButton(
			listGroup,
			"list",
			tip("Bulleted list", "⇧7"),
			() => this.toggleList("ul"),
			() => this.inList("UL") && !this.inTaskList(),
		);
		this.addButton(
			listGroup,
			"list-ordered",
			tip("Numbered list", "⇧9"),
			() => this.toggleList("ol"),
			() => this.inList("OL"),
		);
		this.addButton(
			listGroup,
			"list-checks",
			tip("Checklist", "⇧L"),
			() => this.toggleTaskList(),
			() => this.inTaskList(),
		);
		this.addButton(
			listGroup,
			"indent-decrease",
			tip("Decrease indent", "["),
			() => this.exec("outdent"),
		);
		this.addButton(
			listGroup,
			"indent-increase",
			tip("Increase indent", "]"),
			() => this.exec("indent"),
		);
		let insertGroup = addGroup();
		this.addButton(insertGroup, "table", "Insert table", () =>
			this.insertTable(),
		);
		this.addButton(insertGroup, "minus", "Horizontal line", () =>
			this.exec("insertHorizontalRule"),
		);
	}
	addButton(group, icon, label, onClick, isActive) {
		let button = group.createEl("button", {
			cls: "clickable-icon wy-btn",
			attr: { "aria-label": label, type: "button", tabindex: "-1" },
		});
		setIcon(button, icon);
		this.registerDomEvent(button, "mousedown", (event) => {
			event.preventDefault();
			this.ensureSelectionInEditor();
			onClick();
			this.updateToolbar();
		});
		this.wyButtons.push({ el: button, isActive: isActive });
	}
	updateToolbar() {
		this.updateFoldButton();
		for (let button of this.wyButtons)
			if (button.isActive)
				button.el.toggleClass("is-active", button.isActive());
		let tag = this.currentBlock()?.tagName.toLowerCase() ?? "p",
			inQuote = !!this.closestInSelection("blockquote");
		this.wyBlockSelect.value = [
			"h1",
			"h2",
			"h3",
			"h4",
			"h5",
			"h6",
			"pre",
		].includes(tag)
			? tag
			: inQuote
				? "blockquote"
				: "p";
	}
	exec(command, value) {
		this.wyEditor.focus();
		execCommand(this.doc, command, value);
		this.onEdit();
	}
	queryState(command) {
		return queryCommandState(this.doc, command);
	}
	ensureSelectionInEditor() {
		let selection = this.selection();
		if (
			!selection ||
			!selection.rangeCount ||
			!this.wyEditor.contains(selection.anchorNode)
		) {
			this.wyEditor.focus();
			let range = this.wyLastRange;
			if (range && this.wyEditor.contains(range.startContainer)) {
				selection?.removeAllRanges();
				selection?.addRange(range);
			} else this.placeCaretAtEnd();
		}
	}
	placeCaretAtEnd() {
		let range = this.doc.createRange();
		range.selectNodeContents(this.wyEditor);
		range.collapse(false);
		let selection = this.selection();
		selection.removeAllRanges();
		selection.addRange(range);
	}
	placeCaretAtStart() {
		this.wyEditor.focus();
		let range = this.doc.createRange(),
			start = this.wyEditor.firstElementChild ?? this.wyEditor;
		range.setStart(start, 0);
		range.collapse(true);
		let selection = this.selection();
		selection.removeAllRanges();
		selection.addRange(range);
	}
	closestInSelection(selector) {
		let anchor = this.selection()?.anchorNode ?? null;
		if (!anchor || !this.wyEditor.contains(anchor)) return null;
		let match = (
			anchor.nodeType === 1 ? anchor : anchor.parentElement
		)?.closest(selector);
		return match && this.wyEditor.contains(match) && match !== this.wyEditor
			? match
			: null;
	}
	currentBlock() {
		return this.closestInSelection(
			"p, h1, h2, h3, h4, h5, h6, pre, li, div:not(.wy-editor)",
		);
	}
	inList(tag) {
		let item = this.closestInSelection("li");
		return !!item && item.parentElement?.tagName === tag;
	}
	inTaskList() {
		return !!this.closestInSelection(
			"li",
		)?.parentElement?.classList.contains("wy-task-list");
	}
	setBlock(type) {
		this.ensureSelectionInEditor();
		let quote = this.closestInSelection("blockquote");
		if (type === "blockquote") {
			if (quote) {
				this.exec("outdent");
				return;
			}
			this.exec("formatBlock", "<blockquote>");
			return;
		}
		if (quote && type === "p") {
			this.exec("outdent");
			return;
		}
		let pre = this.closestInSelection("pre");
		if (pre && pre.classList.contains("wy-raw")) return;
		this.exec("formatBlock", `<${type}>`);
		let preAfter = this.closestInSelection("pre");
		if (type === "pre" && preAfter)
			preAfter.setAttribute("spellcheck", "false");
	}
	toggleInline(tag) {
		let existing = this.closestInSelection(
				tag === "code" ? "code:not(pre code)" : "mark",
			),
			selection = this.selection();
		if (!selection || !selection.rangeCount) return;
		if (existing && selection.isCollapsed && this.caretAtEndOf(existing)) {
			let o = existing.nextSibling;
			if (!(o && o.nodeType === 3)) {
				o = this.doc.createTextNode("​");
				existing.after(o);
			}
			let l = o;
			if (!l.data.startsWith("​")) l.data = "​" + l.data;
			let a = this.doc.createRange();
			a.setStart(l, 1);
			a.collapse(true);
			selection.removeAllRanges();
			selection.addRange(a);
			return;
		}
		if (existing) {
			let o = this.doc.createRange();
			o.selectNode(existing);
			selection.removeAllRanges();
			selection.addRange(o);
			let l =
				tag === "code"
					? escapeHtml(existing.textContent ?? "")
					: safeInnerHtml(existing);
			this.exec("insertHTML", l);
			return;
		}
		let range = selection.getRangeAt(0);
		if (range.collapsed) {
			let o = createEl(tag),
				l = this.doc.createTextNode("​");
			o.appendChild(l);
			range.insertNode(o);
			let a = this.doc.createRange();
			a.setStart(l, 1);
			a.collapse(true);
			selection.removeAllRanges();
			selection.addRange(a);
			this.onEdit();
			return;
		}
		let container = createDiv();
		container.appendChild(range.cloneContents());
		let html =
			tag === "code"
				? escapeHtml(container.textContent ?? "")
				: safeInnerHtml(container);
		this.exec("insertHTML", `<${tag}>${html}</${tag}>`);
	}
	clearFormatting() {
		this.exec("removeFormat");
		let e = this.selection();
		if (!e || e.isCollapsed) return;
		let t = e.toString();
		if (this.closestInSelection("mark, code:not(pre code)"))
			this.exec("insertText", t);
	}
	toggleList(type) {
		let inTaskList = this.inTaskList();
		if (inTaskList && type === "ul") {
			this.toggleTaskList();
			return;
		}
		if (inTaskList) this.stripTasks(this.closestInSelection("ul"));
		this.exec(type === "ul" ? "insertUnorderedList" : "insertOrderedList");
	}
	toggleTaskList() {
		let item = this.closestInSelection("li"),
			list = item?.parentElement;
		if (list && list.classList.contains("wy-task-list")) {
			this.stripTasks(list);
			this.onEdit();
			return;
		}
		if (!item || list?.tagName !== "UL") this.exec("insertUnorderedList");
		let bulletList = this.closestInSelection("ul");
		if (!bulletList) return;
		bulletList.addClass("wy-task-list");
		this.normalizeTaskLists();
		this.onEdit();
	}
	stripTasks(list) {
		if (!list) return;
		list.removeClass("wy-task-list");
		list.querySelectorAll(":scope > li").forEach((t) => {
			t.removeClass("wy-task", "is-checked");
			t.querySelector(":scope > input.wy-checkbox")?.remove();
		});
	}
	normalizeTaskLists() {
		this.wyEditor
			.querySelectorAll("ul.wy-task-list > li")
			.forEach((item) => {
				let checkbox = item.querySelector(
					":scope > input[type=checkbox]",
				);
				if (!checkbox) {
					checkbox = createEl("input", {
						type: "checkbox",
						cls: "wy-checkbox",
						attr: { contenteditable: "false" },
					});
					item.insertBefore(checkbox, item.firstChild);
					item.addClass("wy-task");
				} else if (checkbox !== item.firstChild)
					item.insertBefore(checkbox, item.firstChild);
				item.toggleClass("is-checked", checkbox.checked);
			});
	}
	insertTable() {
		this.exec(
			"insertHTML",
			`<table><thead><tr>${"<th><br></th>".repeat(3)}</tr></thead><tbody><tr>${"<td><br></td>".repeat(3)}</tr><tr>${"<td><br></td>".repeat(3)}</tr></tbody></table><p><br></p>`,
		);
	}
	saveRange() {
		let selection = this.selection();
		return selection &&
			selection.rangeCount &&
			this.wyEditor.contains(selection.anchorNode)
			? selection.getRangeAt(0).cloneRange()
			: null;
	}
	restoreRange(range) {
		this.wyEditor.focus();
		let selection = this.selection();
		if ((selection.removeAllRanges(), range)) selection.addRange(range);
		else this.placeCaretAtEnd();
	}
	insertExternalLink() {
		let range = this.saveRange(),
			link = this.closestInSelection("a:not(.wy-wikilink)"),
			selectedText = range?.toString() ?? "";
		new LinkModal(
			this.app,
			link?.getAttribute("href") ??
				(/^https?:\/\//.test(selectedText) ? selectedText : ""),
			(url) => {
				if ((this.restoreRange(range), !url)) {
					if (link) {
						let r = this.doc.createRange();
						r.selectNodeContents(link);
						let i = this.selection();
						i.removeAllRanges();
						i.addRange(r);
						this.exec("unlink");
					}
					return;
				}
				if (!/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith("#"))
					url = "https://" + url;
				if (range && !range.collapsed) this.exec("createLink", url);
				else
					this.exec(
						"insertHTML",
						`<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>&nbsp;`,
					);
			},
		).open();
	}
	insertNoteLink() {
		let range = this.saveRange(),
			selectedText = range?.toString() ?? "";
		new NoteSuggestModal(
			this.app,
			this.app.vault.getMarkdownFiles(),
			"Link to note…",
			(file) => {
				this.restoreRange(range);
				let linktext = this.app.metadataCache.fileToLinktext(
						file,
						this.file?.path ?? "",
						true,
					),
					display = selectedText || linktext,
					alias =
						selectedText && selectedText !== linktext
							? selectedText
							: "";
				this.exec(
					"insertHTML",
					`<a class="wy-wikilink internal-link" data-target="${escapeHtml(linktext)}" data-alias="${escapeHtml(alias)}" data-display="${escapeHtml(display)}" href="#">${escapeHtml(display)}</a>&nbsp;`,
				);
			},
		).open();
	}
	insertImage() {
		let range = this.saveRange(),
			images = this.app.vault
				.getFiles()
				.filter((file) =>
					IMAGE_EXTENSIONS.has(file.extension.toLowerCase()),
				);
		if (!images.length) {
			new Notice("No images found in this vault.");
			return;
		}
		new NoteSuggestModal(this.app, images, "Insert image…", (file) => {
			this.restoreRange(range);
			let linktext = this.app.metadataCache.fileToLinktext(
					file,
					this.file?.path ?? "",
					false,
				),
				resourcePath = this.app.vault.getResourcePath(file);
			this.exec(
				"insertHTML",
				`<img class="wy-embed" data-embed="${escapeHtml(linktext)}" src="${escapeHtml(resourcePath)}" alt="${escapeHtml(file.basename)}">`,
			);
		}).open();
	}
	selectedText() {
		let selection = this.selection();
		return selection && this.wyEditor.contains(selection.anchorNode)
			? selection.toString()
			: "";
	}
	insertMarkdown(markdown) {
		if (
			(this.ensureSelectionInEditor(),
			this.closestInSelection("pre, code"))
		) {
			this.exec("insertText", markdown);
			return;
		}
		if (
			!/[*_`\[\]#=~<>|$%!\n\\]/.test(markdown) &&
			!/^\s*([-+]|\d+[.)])\s/.test(markdown)
		) {
			this.exec("insertText", markdown);
			return;
		}
		let container = createDiv();
		setSafeHtml(container, markdownToHtml(markdown, this.wyHooks));
		postProcessHtml(container);
		this.resolveRelativeImages(container);
		this.renderInlineMath(container);
		let singleParagraph =
			container.children.length === 1 &&
			container.firstElementChild?.tagName === "P"
				? container.firstElementChild
				: null;
		this.exec("insertHTML", safeInnerHtml(singleParagraph ?? container));
	}
	getMarkdown() {
		return this.getViewData();
	}
	setMarkdown(markdown) {
		this.setViewData(markdown, true);
		this.markDirty();
	}
	cursorPos() {
		let selection = this.selection();
		if (
			!selection ||
			!selection.rangeCount ||
			!this.wyEditor.contains(selection.anchorNode)
		) {
			let i = this.getViewData().split(`
`);
			return { line: i.length - 1, ch: i[i.length - 1]?.length ?? 0 };
		}
		let range = this.doc.createRange();
		range.setStart(this.wyEditor, 0);
		range.setEnd(
			selection.getRangeAt(0).startContainer,
			selection.getRangeAt(0).startOffset,
		);
		let container = createDiv();
		container.appendChild(range.cloneContents());
		let lines = joinFrontmatter(
			this.wyFrontmatter,
			htmlToMarkdown(container, {
				indent: this.plugin.settings.useTabs ? "\t" : "    ",
			}).replace(/\n$/, ""),
		).split(`
`);
		return {
			line: lines.length - 1,
			ch: lines[lines.length - 1]?.length ?? 0,
		};
	}
	focus() {
		this.ensureSelectionInEditor();
	}
	runCoreCommand(commandId) {
		let match = commandId.match(/^set-heading-(\d)$/);
		if (match) {
			let level = Number(match[1]);
			this.setBlock(level === 0 ? "p" : `h${Math.min(level, 6)}`);
			return true;
		}
		let handler = {
			"toggle-bold": () => this.exec("bold"),
			"toggle-italics": () => this.exec("italic"),
			"toggle-strikethrough": () => this.exec("strikeThrough"),
			"toggle-highlight": () => this.toggleInline("mark"),
			"toggle-code": () => this.toggleInline("code"),
			"toggle-blockquote": () => this.setBlock("blockquote"),
			"toggle-bullet-list": () => this.toggleList("ul"),
			"toggle-numbered-list": () => this.toggleList("ol"),
			"toggle-checklist-status": () => this.toggleTaskList(),
			"insert-link": () => this.insertExternalLink(),
			"insert-wikilink": () => this.insertNoteLink(),
			"insert-embed": () => this.insertImage(),
			"insert-horizontal-rule": () => this.exec("insertHorizontalRule"),
			"insert-table": () => this.insertTable(),
			"indent-list": () => this.exec("indent"),
			"unindent-list": () => this.exec("outdent"),
			undo: () => this.exec("undo"),
			redo: () => this.exec("redo"),
			"select-all": () => this.exec("selectAll"),
			"toggle-fold": () => this.toggleFold(),
			"fold-all": () => this.foldAll(true),
			"unfold-all": () => this.foldAll(false),
		}[commandId];
		if (!handler) return false;
		this.ensureSelectionInEditor();
		handler();
		this.updateToolbar();
		return true;
	}
	runBridgeCommand(command) {
		try {
			let handled = runEditorCommand(this, command);
			this.updateToolbar();
			return handled;
		} catch (handled) {
			new Notice(handled.message);
			return true;
		}
	}
	shortcutFor(event) {
		let key = event.code.replace(/^Key|^Digit/, "").toLowerCase(),
			shift = event.shiftKey,
			combo =
				(event.altKey ? "alt+" : "") + (shift ? "shift+" : "") + key,
			shortcuts = {
				b: () => this.exec("bold"),
				i: () => this.exec("italic"),
				u: () => this.exec("underline"),
				"shift+x": () => this.exec("strikeThrough"),
				"shift+y": () => this.toggleInline("mark"),
				e: () => this.toggleInline("code"),
				backslash: () => this.clearFormatting(),
				"shift+t": () => this.setBlock("h1"),
				"shift+h": () => this.setBlock("h2"),
				"shift+j": () => this.setBlock("h3"),
				"shift+b": () => this.setBlock("p"),
				"shift+m": () => this.setBlock("pre"),
				quote: () => this.setBlock("blockquote"),
				"shift+7": () => this.toggleList("ul"),
				"shift+8": () => this.toggleList("ul"),
				"shift+9": () => this.toggleList("ol"),
				"shift+l": () => this.toggleTaskList(),
				bracketright: () => this.exec("indent"),
				bracketleft: () => this.exec("outdent"),
				k: () => this.insertExternalLink(),
				"shift+k": () => this.insertNoteLink(),
				z: () => this.exec("undo"),
				"shift+z": () => this.exec("redo"),
				y: () => this.exec("redo"),
				"alt+bracketleft": () => this.toggleFold(null, true),
				"alt+bracketright": () => this.toggleFold(null, false),
			};
		for (let level = 0; level <= 6; level++)
			shortcuts[`alt+${level}`] = () =>
				this.setBlock(level === 0 ? "p" : `h${level}`);
		return shortcuts[combo] ?? null;
	}
	onKeyDown(event) {
		let cmdKey = Platform.isMacOS ? event.metaKey : event.ctrlKey,
			consume = () => {
				event.preventDefault();
				event.stopPropagation();
				this.updateToolbar();
			},
			customCommand = findCommandForKeyEvent(this.app, event, true);
		if (customCommand) {
			if (!isEditorCommand(customCommand)) return;
			if (this.runBridgeCommand(customCommand)) {
				consume();
				event.stopImmediatePropagation();
			}
			return;
		}
		if (cmdKey) {
			let i = this.shortcutFor(event);
			if (i) {
				consume();
				event.stopImmediatePropagation();
				i();
				return;
			}
		}
		let command = findCommandForKeyEvent(this.app, event, false);
		if (
			command &&
			isEditorCommand(command) &&
			this.runBridgeCommand(command)
		) {
			consume();
			event.stopImmediatePropagation();
			return;
		}
		if (event.key === "Tab") {
			if ((event.preventDefault(), this.closestInSelection("pre")))
				execCommand(this.doc, "insertText", "\t");
			else if (this.closestInSelection("td, th"))
				this.moveTableCell(event.shiftKey);
			else if (this.closestInSelection("li"))
				this.exec(event.shiftKey ? "outdent" : "indent");
			return;
		}
		if (event.key === "Enter" && !event.shiftKey && !cmdKey) {
			let i = this.closestInSelection("pre");
			if (i) {
				if (
					(event.preventDefault(),
					this.caretAtEndOf(i) &&
						/\n$/.test(i.innerText.replace(/\n$/, "")))
				)
					this.exitBlock(i);
				else execCommand(this.doc, "insertLineBreak");
				this.onEdit();
				return;
			}
			let o = this.closestInSelection("li"),
				l = this.closestInSelection("blockquote");
			if (l && !this.closestInSelection("li")) {
				let c = this.currentBlock(),
					h = c && l.contains(c) ? c : l;
				if (
					(h.textContent ?? "").replace(/[\u200b\s]/g, "") === "" &&
					!h.querySelector("img")
				) {
					if ((event.preventDefault(), h === l)) {
						let p = emptyParagraph();
						l.replaceWith(p);
						let d = this.doc.createRange();
						d.setStart(p, 0);
						d.collapse(true);
						let f = this.selection();
						f.removeAllRanges();
						f.addRange(d);
					} else {
						h.remove();
						this.exitBlock(l);
					}
					this.onEdit();
					return;
				}
			}
			if (o && isEmptyListItem(o)) {
				event.preventDefault();
				this.leaveListItem(o);
				this.onEdit();
				return;
			}
			let a = this.closestInSelection("h1, h2, h3, h4, h5, h6");
			if (a?.hasClass(COLLAPSED_CLASS) && this.caretAtEndOf(a))
				this.toggleFold(a, false);
			if (a && this.caretAtEndOf(a)) {
				event.preventDefault();
				this.exitBlock(a);
				this.onEdit();
				return;
			}
		}
		if (event.key === "Backspace") {
			let i = this.closestInSelection(
				"h1, h2, h3, h4, h5, h6, pre:not(.wy-raw)",
			);
			if (i && this.caretAtStartOf(i)) {
				event.preventDefault();
				this.exec("formatBlock", "<p>");
				return;
			}
		}
	}
	leaveListItem(item) {
		let list = item.parentElement;
		if (
			!!list.parentElement?.closest("li") ||
			["UL", "OL"].includes(list.parentElement?.tagName ?? "")
		) {
			item.querySelector(":scope > input.wy-checkbox")?.remove();
			execCommand(this.doc, "outdent");
			return;
		}
		let following = Array.from(list.children).slice(
				Array.from(list.children).indexOf(item) + 1,
			),
			paragraph = emptyParagraph();
		if ((list.after(paragraph), following.length)) {
			let newList = list.cloneNode(false);
			if (newList.tagName === "OL")
				newList.setAttribute(
					"start",
					String(
						Array.from(list.children).filter(
							(a) => a.tagName === "LI",
						).length,
					),
				);
			following.forEach((a) => newList.appendChild(a));
			paragraph.after(newList);
		}
		if ((item.remove(), !list.querySelector("li"))) list.remove();
		let range = this.doc.createRange();
		range.setStart(paragraph, 0);
		range.collapse(true);
		let selection = this.selection();
		selection.removeAllRanges();
		selection.addRange(range);
	}
	caretAtEndOf(element) {
		let selection = this.selection();
		if (!selection || !selection.isCollapsed || !selection.rangeCount)
			return false;
		let range = this.doc.createRange();
		range.selectNodeContents(element);
		range.setStart(
			selection.getRangeAt(0).endContainer,
			selection.getRangeAt(0).endOffset,
		);
		return range.toString().replace(/\u200b/g, "") === "";
	}
	caretAtStartOf(element) {
		let selection = this.selection();
		if (!selection || !selection.isCollapsed || !selection.rangeCount)
			return false;
		let range = this.doc.createRange();
		range.selectNodeContents(element);
		range.setEnd(
			selection.getRangeAt(0).startContainer,
			selection.getRangeAt(0).startOffset,
		);
		return range.toString().replace(/\u200b/g, "") === "";
	}
	exitBlock(block) {
		if (block.tagName === "PRE") {
			let last = block.lastChild;
			if (last?.nodeName === "BR") last.remove();
			else if (last?.nodeType === 3)
				last.data = last.data.replace(/\n$/, "");
		}
		let paragraph = emptyParagraph();
		block.after(paragraph);
		let range = this.doc.createRange();
		range.setStart(paragraph, 0);
		range.collapse(true);
		let selection = this.selection();
		selection.removeAllRanges();
		selection.addRange(range);
	}
	moveTableCell(backwards) {
		let cell = this.closestInSelection("td, th"),
			table = cell?.closest("table");
		if (!cell || !table) return;
		let cells = Array.from(table.querySelectorAll("td, th")),
			index = cells.indexOf(cell) + (backwards ? -1 : 1);
		if (index >= cells.length) {
			let row = cell.parentElement,
				newRow = row.cloneNode(false);
			for (let h = 0; h < row.children.length; h++)
				newRow.createEl("td").createEl("br");
			(table.tBodies[0] ?? table).appendChild(newRow);
			this.onEdit();
			index = cells.length;
		}
		let target = table.querySelectorAll("td, th")[Math.max(0, index)];
		if (!target) return;
		let range = this.doc.createRange();
		range.selectNodeContents(target);
		let selection = this.selection();
		selection.removeAllRanges();
		selection.addRange(range);
	}
	onPaste(event) {
		let clipboard = event.clipboardData;
		if (!clipboard) return;
		event.preventDefault();
		let inCode = this.closestInSelection("pre, code"),
			plain = clipboard.getData("text/plain");
		if (inCode) {
			execCommand(this.doc, "insertText", plain);
			return;
		}
		let markdown,
			html = clipboard.getData("text/html");
		if (html) {
			let container = createDiv();
			setSafeHtml(container, html);
			markdown = htmlToMarkdown(container);
		} else markdown = plain;
		if (!markdown.trim()) return;
		this.insertMarkdown(markdown);
	}
	onClick(event) {
		let target = event.target;
		if (target.instanceOf(HTMLInputElement) && target.type === "checkbox") {
			this.win.setTimeout(() => {
				target.toggleAttribute("checked", target.checked);
				target.closest("li")?.toggleClass("is-checked", target.checked);
				this.markDirty();
			});
			return;
		}
		let link = target.closest("a");
		if (!link || !this.wyEditor.contains(link)) return;
		let modifierDown = Platform.isMacOS ? event.metaKey : event.ctrlKey,
			clickOpens = this.plugin.settings.linkClick === "click";
		if (!(modifierDown || clickOpens)) return;
		if ((event.preventDefault(), link.classList.contains("wy-wikilink")))
			this.app.workspace.openLinkText(
				link.dataset.target ?? "",
				this.file?.path ?? "",
				modifierDown && clickOpens ? "tab" : modifierDown,
			);
		else {
			let href = link.getAttribute("href");
			if (href && href !== "#") this.win.open(href, "_blank", "noopener");
		}
	}
}

function isEmptyListItem(item) {
	if (item.querySelector("ul, ol, img, table, pre")) return false;
	return (item.textContent ?? "").replace(/[\u200b\s]/g, "") === "";
}

const BLOCK_TYPES = [
	"p",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"blockquote",
	"pre",
];

function toBlockType(type) {
	return BLOCK_TYPES.find((candidate) => candidate === type) ?? "p";
}
