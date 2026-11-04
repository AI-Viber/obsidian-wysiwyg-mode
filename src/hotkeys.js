/**
 * Reads Obsidian's hotkey settings: shows the user's hotkeys in tooltips and
 * matches key presses to commands, so other plugins' hotkeys work in WYSIWYG.
 */

import { Platform } from "obsidian";

const MAC_MODIFIER_SYMBOLS = {
	Ctrl: "⌃",
	Alt: "⌥",
	Shift: "⇧",
	Mod: "⌘",
	Meta: "⌘",
};

const MAC_MODIFIER_ORDER = ["Ctrl", "Alt", "Shift", "Mod", "Meta"];

const OTHER_MODIFIER_ORDER = ["Mod", "Ctrl", "Meta", "Alt", "Shift"];

const KEY_SYMBOLS = {
	ArrowUp: "↑",
	ArrowDown: "↓",
	ArrowLeft: "←",
	ArrowRight: "→",
	Enter: "↵",
	Backspace: "⌫",
	Delete: "⌦",
	Escape: "Esc",
	" ": "Space",
	Tab: "Tab",
};

function formatHotkey(hotkey) {
	let keyLabel =
		KEY_SYMBOLS[hotkey.key] ??
		(hotkey.key.length === 1 ? hotkey.key.toUpperCase() : hotkey.key);
	if (Platform.isMacOS)
		return (
			MAC_MODIFIER_ORDER.filter((r) => hotkey.modifiers.includes(r))
				.map((r) => MAC_MODIFIER_SYMBOLS[r])
				.join("") + keyLabel
		);
	return [
		...OTHER_MODIFIER_ORDER.filter((s) => hotkey.modifiers.includes(s)).map(
			(s) => (s === "Mod" ? "Ctrl" : s === "Meta" ? "Win" : s),
		),
		keyLabel,
	].join(" + ");
}

export function hotkeyLabelFor(app, commandId) {
	let manager = app.hotkeyManager,
		hotkey = (manager?.customKeys?.[commandId] ??
			manager?.defaultKeys?.[commandId] ??
			[])[0];
	return hotkey ? formatHotkey(hotkey) : null;
}

function modifiersOf(event) {
	let modifiers = new Set();
	if (Platform.isMacOS) {
		if (event.metaKey) modifiers.add("Mod");
		if (event.ctrlKey) modifiers.add("Ctrl");
	} else {
		if (event.ctrlKey) modifiers.add("Mod");
		if (event.metaKey) modifiers.add("Meta");
	}
	if (event.altKey) modifiers.add("Alt");
	if (event.shiftKey) modifiers.add("Shift");
	return modifiers;
}

function normalizeModifier(modifier) {
	if (Platform.isMacOS && modifier === "Meta") return "Mod";
	if (!Platform.isMacOS && modifier === "Ctrl") return "Mod";
	return modifier;
}

function keyNamesOf(event) {
	let names = new Set();
	names.add(event.key.length === 1 ? event.key.toUpperCase() : event.key);
	let code = event.code;
	if (/^Key[A-Z]$/.test(code)) names.add(code.slice(3));
	else if (/^Digit\d$/.test(code)) names.add(code.slice(5));
	else if (/^Numpad\d$/.test(code)) names.add(code.slice(6));
	else {
		let symbols = {
			BracketLeft: "[",
			BracketRight: "]",
			Backslash: "\\",
			Slash: "/",
			Period: ".",
			Comma: ",",
			Semicolon: ";",
			Quote: "'",
			Backquote: "`",
			Minus: "-",
			Equal: "=",
			Space: " ",
		};
		if (symbols[code]) names.add(symbols[code]);
		names.add(code);
	}
	return Array.from(names);
}

function hotkeysFor(app, command) {
	let manager = app.hotkeyManager,
		custom = manager?.customKeys?.[command.id];
	if (custom) return { custom: true, keys: custom };
	return {
		custom: false,
		keys: manager?.defaultKeys?.[command.id] ?? command.hotkeys ?? [],
	};
}

/**
 * Find the Obsidian command whose hotkey matches a key press.
 * With customOnly, only user-assigned hotkeys count.
 */
export function findCommandForKeyEvent(app, event, customOnly) {
	if (!event.altKey && !event.metaKey && !event.ctrlKey) return null;
	if (["Alt", "Meta", "Control", "Shift"].includes(event.key)) return null;
	let pressed = modifiersOf(event),
		pressedKeys = keyNamesOf(event).map((command) => command.toUpperCase()),
		commands = app.commands?.commands ?? {};
	for (let command of Object.values(commands)) {
		let { custom: isCustom, keys: hotkeys } = hotkeysFor(app, command);
		if (customOnly && !isCustom) continue;
		for (let hotkey of hotkeys) {
			let hotkeyModifiers = new Set(
				hotkey.modifiers.map(normalizeModifier),
			);
			if (
				hotkeyModifiers.size !== pressed.size ||
				![...hotkeyModifiers].every((p) => pressed.has(p))
			)
				continue;
			if (pressedKeys.includes(String(hotkey.key).toUpperCase()))
				return command;
		}
	}
	return null;
}

export const isEditorCommand = (command) =>
	!!(command.editorCallback || command.editorCheckCallback);
