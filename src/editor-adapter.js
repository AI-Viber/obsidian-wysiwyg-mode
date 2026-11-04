/**
 * Lets other plugins' editor commands run in WYSIWYG by presenting the view
 * through the subset of Obsidian's Editor API they rely on.
 */

export function runEditorCommand(view, command) {
	if (
		command.id.startsWith("editor:") &&
		view.runCoreCommand(command.id.slice(7))
	)
		return true;
	let editor = new WysiwygEditorAdapter(view),
		context = { app: view.app, file: view.file, editor: editor };
	try {
		if (command.editorCheckCallback) {
			if (!command.editorCheckCallback(true, editor, context))
				return false;
			command.editorCheckCallback(false, editor, context);
		} else if (command.editorCallback)
			command.editorCallback(editor, context);
		else return false;
	} catch (error) {
		throw (
			console.error("WYSIWYG Mode: command failed", command.id, error),
			Error(
				`“${command.name}” doesn't work in WYSIWYG mode (${error.message})`,
			)
		);
	}
	return true;
}

class WysiwygEditorAdapter {
	host;
	constructor(host) {
		this.host = host;
	}
	lines() {
		return this.host.getMarkdown().split(`
`);
	}
	getValue() {
		return this.host.getMarkdown();
	}
	setValue(value) {
		this.host.setMarkdown(value);
	}
	lineCount() {
		return this.lines().length;
	}
	lastLine() {
		return this.lines().length - 1;
	}
	getLine(index) {
		return this.lines()[index] ?? "";
	}
	setLine(index, text) {
		let lines = this.lines();
		if (index < 0 || index >= lines.length) return;
		lines[index] = text;
		this.host.setMarkdown(
			lines.join(`
`),
		);
	}
	posToOffset(pos) {
		let lines = this.lines(),
			offset = 0;
		for (let s = 0; s < Math.min(pos.line, lines.length); s++)
			offset += (lines[s]?.length ?? 0) + 1;
		return offset + Math.min(pos.ch, (lines[pos.line] ?? "").length);
	}
	offsetToPos(offset) {
		let lines = this.lines(),
			line = 0;
		while (line < lines.length - 1 && offset > (lines[line]?.length ?? 0)) {
			offset -= (lines[line]?.length ?? 0) + 1;
			line++;
		}
		return { line: line, ch: Math.max(0, offset) };
	}
	getRange(from, to) {
		return this.host
			.getMarkdown()
			.slice(this.posToOffset(from), this.posToOffset(to));
	}
	getSelection() {
		return this.host.selectedText();
	}
	somethingSelected() {
		return this.host.selectedText().length > 0;
	}
	getCursor(e) {
		return this.host.cursorPos();
	}
	listSelections() {
		let cursor = this.getCursor();
		return [{ anchor: cursor, head: cursor }];
	}
	setCursor() {}
	setSelection() {}
	setSelections() {}
	replaceSelection(text) {
		this.host.insertMarkdown(text);
	}
	replaceRange(text, from, to) {
		let cursor = this.getCursor();
		if (
			(!to || (to.line === from.line && to.ch === from.ch)) &&
			from.line === cursor.line &&
			from.ch === cursor.ch
		) {
			this.host.insertMarkdown(text);
			return;
		}
		let doc = this.host.getMarkdown(),
			start = this.posToOffset(from),
			end = to ? this.posToOffset(to) : start;
		this.host.setMarkdown(doc.slice(0, start) + text + doc.slice(end));
	}
	transaction(spec) {
		if (spec?.replaceSelection !== undefined)
			this.replaceSelection(spec.replaceSelection);
		for (let change of spec?.changes ?? [])
			this.replaceRange(change.text ?? "", change.from, change.to);
	}
	wordAt() {
		return null;
	}
	focus() {
		this.host.focus();
	}
	blur() {}
	hasFocus() {
		return true;
	}
	scrollIntoView() {}
	scrollTo() {}
	getScrollInfo() {
		return { top: 0, left: 0 };
	}
	refresh() {}
	undo() {
		this.host.runCoreCommand("undo");
	}
	redo() {
		this.host.runCoreCommand("redo");
	}
	exec(command) {
		this.host.runCoreCommand(command);
	}
	processLines() {}
	getDoc() {
		return this;
	}
}
