/**
 * Small modals used by the editor: link address, note picker, editor-action picker.
 */

import { FuzzySuggestModal, Modal, Setting } from "obsidian";
import { isEditorCommand } from "./hotkeys.js";

export class LinkModal extends Modal {
	initial;
	done;
	constructor(app, initial, done) {
		super(app);
		this.initial = initial;
		this.done = done;
	}
	onOpen() {
		this.titleEl.setText("Link");
		let value = this.initial,
			submit = () => {
				this.close();
				this.done(value.trim());
			};
		new Setting(this.contentEl)
			.setName("Web address")
			.setDesc("Leave empty to remove an existing link.")
			.addText((n) => {
				n.setPlaceholder("https://example.com")
					.setValue(value)
					.onChange((s) => (value = s));
				n.inputEl.addClass("wy-link-input");
				n.inputEl.addEventListener("keydown", (s) => {
					if (s.key === "Enter") {
						s.preventDefault();
						submit();
					}
				});
				window.setTimeout(() => n.inputEl.focus(), 0);
			});
		new Setting(this.contentEl)
			.addButton((n) => n.setButtonText("Apply").setCta().onClick(submit))
			.addButton((n) =>
				n.setButtonText("Cancel").onClick(() => this.close()),
			);
	}
	onClose() {
		this.contentEl.empty();
	}
}

export class NoteSuggestModal extends FuzzySuggestModal {
	files;
	done;
	constructor(app, files, placeholder, done) {
		super(app);
		this.files = files;
		this.done = done;
		this.setPlaceholder(placeholder);
	}
	getItems() {
		return this.files;
	}
	getItemText(file) {
		return file.path.replace(/\.md$/, "");
	}
	onChooseItem(file) {
		this.done(file);
	}
}

export class EditorActionModal extends FuzzySuggestModal {
	run;
	constructor(app, run) {
		super(app);
		this.run = run;
		this.setPlaceholder("Run an editor action in WYSIWYG…");
	}
	getItems() {
		let commands = this.app.commands?.commands ?? {};
		return Object.values(commands)
			.filter((t) => isEditorCommand(t))
			.sort((t, n) => t.name.localeCompare(n.name));
	}
	getItemText(command) {
		return command.name;
	}
	onChooseItem(command) {
		window.setTimeout(() => this.run(command), 0);
	}
}
