# WYSIWYG Mode for Obsidian

Edit your notes like in a word processor. Notes open as a single, formatted page with a toolbar and the familiar Apple Notes / Pages shortcuts, and every note is still saved as plain Markdown.

## Features

- **Word-processor editing**: headings, bold, italic, underline, strikethrough, highlight, links, bulleted / numbered / checklists, quotes, code blocks, tables and images.
- **Still Markdown**: notes are saved as ordinary Markdown files, so they work everywhere else in Obsidian and in other apps.
- **Switch on and off**: use the pen button in a note's header, the ribbon icon, the status bar, or the *Toggle WYSIWYG editing* command. Any single note can be shown as Markdown with *Show this note as Markdown*.
- **Heading folding**: arrows in the left margin, `⌥⌘[` / `⌥⌘]`, and fold / unfold all commands. A header button steps through heading levels one at a time (in the normal editing and reading views too). Alt-click opens everything.
- **Folder label**: a grey label at the end of the title line shows the note's folder. Select it (or run *Move this note to another folder*) to pick a new folder or create one. The folder you moved a note to last is listed first. Links are updated when a note moves.
- **Works with your hotkeys**: your own hotkeys take priority, and editor commands from other plugins (for example timestamp or bullet commands) run inside WYSIWYG. *Run an editor action from another plugin* lists them.
- **Obsidian syntax**: wikilinks, `![[embeds]]`, `==highlights==`, `#tags` (styled as you type), math, comments, footnotes and callouts are kept intact.
- **Safe by default**: scripts and unsafe links in notes or pasted content are removed.

## Keyboard shortcuts

On Windows and Linux use Ctrl in place of ⌘.

| Action | Shortcut |
| --- | --- |
| Bold / italic / underline | ⌘B / ⌘I / ⌘U |
| Strikethrough / highlight / inline code | ⇧⌘X / ⇧⌘Y / ⌘E |
| Clear formatting | ⌘\\ |
| Heading 1 / 2 / 3 | ⇧⌘T / ⇧⌘H / ⇧⌘J |
| Normal text / code block | ⇧⌘B / ⇧⌘M |
| Headings 1–6, normal text | ⌥⌘1 … ⌥⌘6, ⌥⌘0 |
| Quote | ⌘' |
| Bulleted / numbered list / checklist | ⇧⌘7 (or ⇧⌘8) / ⇧⌘9 / ⇧⌘L |
| Indent / outdent | ⌘] / ⌘[ |
| Link / link to note | ⌘K / ⇧⌘K |
| Undo / redo | ⌘Z / ⇧⌘Z |
| Fold / unfold heading | ⌥⌘[ / ⌥⌘] |

The plugin does not set a default hotkey for turning WYSIWYG on and off. Assign one under **Settings → Hotkeys**.

## Settings

- Formatting toolbar, note title and folder label on or off.
- Page style (paper or plain) and page width.
- Whether links open with Ctrl/Cmd + click or a plain click.
- Indent nested lists with tabs or four spaces.

## Installation

Once it is listed in the community directory: **Settings → Community plugins → Browse**, search for *WYSIWYG Mode*, then install and enable it.

To try it before then, install it with [BRAT](https://github.com/TfTHacker/obsidian42-brat) using `AI-Viber/obsidian-wysiwyg-mode`, or copy `main.js`, `manifest.json` and `styles.css` from the latest release into `<your vault>/.obsidian/plugins/wysiwyg-mode/` and enable the plugin.

## Privacy

The plugin works entirely on your device. It sends nothing over the network and collects no data (remote images in your notes load the same way they do in Obsidian itself). The only things it stores are its settings, the folded headings of each note and the last folder you moved a note to, all in the plugin's own `data.json`.

## Development

```bash
npm install
npm run dev      # rebuild on change (writes main.js)
npm run build    # production build
npm run lint
```

The source is plain JavaScript in `src/`, bundled by esbuild. The Markdown parser is [marked](https://github.com/markedjs/marked).

| File | What it does |
| --- | --- |
| `main.js` | Plugin entry: commands, ribbon / status bar, events |
| `view.js` | The WYSIWYG editor view and toolbar |
| `mode.js` | Switches panes between WYSIWYG and Markdown |
| `markdown-to-html.js`, `html-to-markdown.js` | The two directions of conversion |
| `folding.js`, `tags.js` | Heading folding and live `#tag` styling |
| `folder-label.js`, `move-modal.js` | Folder label and the move-note picker |
| `header-buttons.js` | Header buttons in Obsidian's own views |
| `hotkeys.js`, `editor-adapter.js` | Use the user's hotkeys and other plugins' editor commands |
| `modals.js`, `settings.js`, `dom-utils.js` | Dialogs, settings, small helpers |

### Releasing

1. Update the version: `npm version patch` (or `minor` / `major`). This updates `manifest.json` and `versions.json` and creates a git tag with no `v` prefix.
2. `git push --follow-tags`. The *Release Obsidian plugin* workflow builds the plugin and creates a **draft** release containing `main.js`, `manifest.json` and `styles.css`.
3. Review and publish the draft release.

## License

[MIT](LICENSE)
