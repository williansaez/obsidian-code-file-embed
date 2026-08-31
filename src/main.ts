import {
	MarkdownPostProcessorContext,
	Notice,
	Plugin,
	TFile,
} from "obsidian";
import {
	CodeFileSettings,
	CodeFileSettingTab,
	DEFAULT_SETTINGS,
} from "./settings";
import { parseCodeFileSource } from "./parser";
import { CodeFileChild } from "./CodeFileChild";
import {
	BINARY_RE,
	BakeResult,
	bakeMarkdown,
	mentionsCodeFileTarget,
	parseBakedFenceLine,
	unbakeMarkdown,
} from "./bake";
import { extToLang, getExtension } from "./langMap";

/** Delay before auto-baking after a source file save, to coalesce bursts. */
const AUTO_BAKE_DEBOUNCE_MS = 2000;

export default class CodeFilePlugin extends Plugin {
	settings: CodeFileSettings = DEFAULT_SETTINGS;
	private autoBakeTimers = new Map<string, number>();
	private activeChildren = new Set<CodeFileChild>();

	/** Called by CodeFileChild.onload so settings changes can re-render it. */
	registerChild_(child: CodeFileChild): void {
		this.activeChildren.add(child);
	}

	/** Called by CodeFileChild.onunload. */
	unregisterChild_(child: CodeFileChild): void {
		this.activeChildren.delete(child);
	}

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerMarkdownCodeBlockProcessor(
			"codefile",
			(source, el, ctx) => {
				const spec = this.resolveSpec(source, el, ctx);
				const ref = parseCodeFileSource(spec);
				ctx.addChild(new CodeFileChild(this, ctx, el, ref));
			},
		);

		// Baked blocks (```<lang> codefile:<spec>) render natively everywhere;
		// in reading view, upgrade them to the live embed when the source file
		// still resolves, so they stay in sync while editing the vault.
		this.registerMarkdownPostProcessor((el, ctx) => {
			if (!el.querySelector("pre > code")) return;
			const info = ctx.getSectionInfo(el);
			if (!info) return;
			const fenceLine = info.text.split("\n")[info.lineStart] ?? "";
			const spec = parseBakedFenceLine(fenceLine);
			if (!spec) return;
			const ref = parseCodeFileSource(spec);
			if (!ref) return;
			const dest = this.app.metadataCache.getFirstLinkpathDest(
				ref.linkpath,
				ctx.sourcePath,
			);
			// Source missing (e.g. published-only vault copy): keep the baked
			// content instead of degrading to an error box.
			if (!(dest instanceof TFile)) return;
			el.empty();
			ctx.addChild(new CodeFileChild(this, ctx, el, ref));
		});

		this.addCommand({
			id: "bake-current-note",
			name: "Bake code embeds in current note (for Publish)",
			callback: () => void this.runBake("current"),
		});
		this.addCommand({
			id: "bake-all-notes",
			name: "Bake code embeds in all notes (for Publish)",
			callback: () => void this.runBake("all"),
		});
		this.addCommand({
			id: "unbake-current-note",
			name: "Un-bake code embeds in current note",
			callback: () => void this.runUnbake("current"),
		});
		this.addCommand({
			id: "unbake-all-notes",
			name: "Un-bake code embeds in all notes",
			callback: () => void this.runUnbake("all"),
		});

		// Auto-bake: when a non-markdown source file is saved, refresh the
		// notes embedding it. Baking only ever rewrites markdown notes, which
		// this handler ignores, so it cannot retrigger itself.
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (!this.settings.autoBakeOnSourceChange) return;
				if (!(file instanceof TFile) || file.extension === "md") return;
				const pending = this.autoBakeTimers.get(file.path);
				if (pending !== undefined) window.clearTimeout(pending);
				this.autoBakeTimers.set(
					file.path,
					window.setTimeout(() => {
						this.autoBakeTimers.delete(file.path);
						void this.autoBakeFor(file);
					}, AUTO_BAKE_DEBOUNCE_MS),
				);
			}),
		);

		this.addSettingTab(new CodeFileSettingTab(this.app, this));
	}

	onunload(): void {
		for (const timer of this.autoBakeTimers.values()) {
			window.clearTimeout(timer);
		}
		this.autoBakeTimers.clear();
	}

	/** Re-bake every note whose codefile blocks may reference this source. */
	private async autoBakeFor(source: TFile): Promise<void> {
		let changedNotes = 0;
		for (const note of this.app.vault.getMarkdownFiles()) {
			const md = await this.app.vault.cachedRead(note);
			if (!mentionsCodeFileTarget(md, source.name)) continue;
			const res = await this.bakeNote(note);
			if (res.changed) changedNotes++;
		}
		if (changedNotes > 0) {
			new Notice(
				`codefile: ${source.name} mudou — ${changedNotes} nota(s) re-baked`,
			);
		}
	}

	/** Bake one note's markdown, writing back only when something changed. */
	private async bakeNote(
		file: TFile,
	): Promise<BakeResult & { changed: boolean }> {
		const md = await this.app.vault.read(file);
		const res = await bakeMarkdown(md, {
			resolve: async (linkpath) => {
				const dest = this.app.metadataCache.getFirstLinkpathDest(
					linkpath,
					file.path,
				);
				if (!(dest instanceof TFile)) return null;
				const maxKb = this.settings.maxFileSizeKb;
				if (maxKb > 0 && dest.stat.size > maxKb * 1024) {
					return { error: `arquivo grande demais: ${dest.path}` };
				}
				const content = await this.app.vault.cachedRead(dest);
				if (BINARY_RE.test(content)) {
					return { error: `arquivo parece binário: ${dest.path}` };
				}
				return { path: dest.path, content };
			},
			langFor: (path) =>
				extToLang(getExtension(path), this.settings.langOverrides),
		});
		const changed = res.output !== md;
		if (changed) {
			await this.app.vault.modify(file, res.output);
		}
		return { ...res, changed };
	}

	private async runBake(scope: "current" | "all"): Promise<void> {
		const files = this.targetFiles(scope);
		if (!files) return;

		let baked = 0;
		const problems: string[] = [];
		for (const file of files) {
			const res = await this.bakeNote(file);
			baked += res.bakedCount;
			for (const msg of [...res.errors, ...res.warnings]) {
				problems.push(`${file.path}: ${msg}`);
			}
		}
		this.report(`${baked} bloco(s) baked`, problems);
	}

	private async runUnbake(scope: "current" | "all"): Promise<void> {
		const files = this.targetFiles(scope);
		if (!files) return;

		let unbaked = 0;
		for (const file of files) {
			const md = await this.app.vault.read(file);
			const res = unbakeMarkdown(md);
			if (res.output !== md) {
				await this.app.vault.modify(file, res.output);
			}
			unbaked += res.unbakedCount;
		}
		this.report(`${unbaked} bloco(s) revertidos para codefile`, []);
	}

	private targetFiles(scope: "current" | "all"): TFile[] | null {
		if (scope === "all") return this.app.vault.getMarkdownFiles();
		const active = this.app.workspace.getActiveFile();
		if (!active || active.extension !== "md") {
			new Notice("codefile: nenhuma nota ativa");
			return null;
		}
		return [active];
	}

	private report(summary: string, problems: string[]): void {
		if (problems.length === 0) {
			new Notice(`codefile: ${summary}`);
			return;
		}
		new Notice(
			`codefile: ${summary}; ${problems.length} problema(s):\n` +
				problems.slice(0, 5).join("\n") +
				(problems.length > 5 ? "\n…" : ""),
			10000,
		);
		console.warn("[codefile] bake problems:", problems);
	}

	/**
	 * Get the spec string: prefer the block body (first non-empty line), else
	 * read it off the fence info line after the `codefile` keyword.
	 */
	private resolveSpec(
		source: string,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
	): string {
		const body = (source ?? "").trim();
		if (body) {
			const firstLine = body.split("\n").find((l) => l.trim().length > 0);
			if (firstLine) return firstLine.trim();
		}

		const info = ctx.getSectionInfo(el);
		if (info) {
			const fenceLine = info.text.split("\n")[info.lineStart] ?? "";
			return fenceLine.replace(/^[`~]{3,}\s*codefile\b/i, "").trim();
		}

		return "";
	}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as Partial<CodeFileSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		// Settings affect how every embed renders (header, size limit, langs):
		// refresh live embeds so toggles take effect immediately (issue #1).
		for (const child of this.activeChildren) child.rerender();
	}
}
