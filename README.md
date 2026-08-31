# Code File Embed (Obsidian plugin)

Embed the current contents of a vault file as a syntax-highlighted code block,
instead of copy-pasting code into a fenced block.

## Usage

Point a `codefile` block at a file. The language is inferred from the extension.

````markdown
```codefile src/foo.abap
```
````

Line range (1-based, inclusive):

````markdown
```codefile src/foo.abap:10-25
```
````

Single line: `:10`. The path can also go in the block body (first line) if you
prefer. Paths resolve like Obsidian links (relative to the current note,
shortest-unique names work).

## Features

- Syntax highlighting by extension, reusing Obsidian's own renderer (theme +
  copy button included).
- Live update: the block re-renders when the target file is saved or renamed.
- Optional clickable header showing the file path.
- Configurable extension → language map and max file size in settings.

## Obsidian Publish

Publish does not run community plugins, so `codefile` blocks render empty on
published sites. To publish, "bake" the embeds first:

- **Bake code embeds in current note / all notes (for Publish)**: converts each
  `codefile` block into a plain language fence carrying a marker, with the
  code inlined:

  ````markdown
  ```abap codefile:_src/ZCL_MVO_UTIL.abap:150-219
  ...embedded code...
  ```
  ````

  Publish (and any other Markdown renderer) shows it as a normal highlighted
  code block. Inside Obsidian's reading view the plugin recognizes the marker
  and keeps rendering it as a live embed. Re-run the command any time to
  refresh baked content from the source files; it is idempotent.

- **Un-bake code embeds**: converts baked blocks back into empty `codefile`
  blocks.

## Development

```bash
npm install
npm run dev    # watch build -> main.js
npm run build  # type-check + production bundle
npm test       # unit tests (parser, langMap)
```

Copy `main.js`, `manifest.json`, and `styles.css` into
`<vault>/.obsidian/plugins/codefile/` to try it in a vault.
