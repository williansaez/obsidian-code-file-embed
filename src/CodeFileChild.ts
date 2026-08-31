import {
	MarkdownPostProcessorContext,
	MarkdownRenderChild,
	MarkdownRenderer,
	TAbstractFile,
	TFile,
} from "obsidian";
import type CodeFilePlugin from "./main";
import { CodeFileRef } from "./parser";
import { extToLang, getExtension } from "./langMap";
import { BINARY_RE, pickFence } from "./bake";

/** Renders one `codefile` block and keeps it live-updated. */
export class CodeFileChild extends MarkdownRenderChild {
	private targetPath: string | null = null;

	constructor(
		private plugin: CodeFilePlugin,
		private ctx: MarkdownPostProcessorContext,
		containerEl: HTMLElement,
		private ref: CodeFileRef | null,
	) {
		super(containerEl);
	}

	onload(): void {
		void this.render();

		this.registerEvent(
			this.plugin.app.vault.on("modify", (file: TAbstractFile) => {
				if (this.targetPath && file.path === this.targetPath) void this.render();
			}),
		);
		this.registerEvent(
			this.plugin.app.vault.on(
				"rename",
				(file: TAbstractFile, oldPath: string) => {
					if (this.targetPath && oldPath === this.targetPath) {
						this.targetPath = file.path;
						void this.render();
					}
				},
			),
		);
	}

	private async render(): Promise<void> {
		const el = this.containerEl;
		el.empty();
		el.addClass("codefile-embed");

		if (!this.ref) {
			this.renderError("informe o caminho do arquivo");
			return;
		}

		const app = this.plugin.app;
		const dest = app.metadataCache.getFirstLinkpathDest(
			this.ref.linkpath,
			this.ctx.sourcePath,
		);
		if (!(dest instanceof TFile)) {
			this.renderError(`arquivo não encontrado: ${this.ref.linkpath}`);
			return;
		}
		this.targetPath = dest.path;

		const maxKb = this.plugin.settings.maxFileSizeKb;
		if (maxKb > 0 && dest.stat.size > maxKb * 1024) {
			this.renderError(
				`arquivo grande demais (${Math.round(dest.stat.size / 1024)} KB > ${maxKb} KB)`,
			);
			return;
		}

		let content: string;
		try {
			content = await app.vault.cachedRead(dest);
		} catch (e) {
			this.renderError(`erro ao ler arquivo: ${String(e)}`);
			return;
		}

		if (BINARY_RE.test(content)) {
			this.renderError("arquivo parece binário");
			return;
		}

		let rangeNote = "";
		if (this.ref.start !== undefined) {
			const lines = content.split("\n");
			let s = this.ref.start;
			let e = this.ref.end ?? this.ref.start;
			if (s > e) [s, e] = [e, s];
			if (s < 1) s = 1;
			if (s > lines.length) {
				rangeNote = " (faixa fora do arquivo — mostrando tudo)";
			} else {
				content = lines.slice(s - 1, Math.min(e, lines.length)).join("\n");
			}
		}

		const lang = extToLang(
			getExtension(dest.path),
			this.plugin.settings.langOverrides,
		);

		if (this.plugin.settings.showHeader) {
			this.renderHeader(dest, rangeNote);
		}

		const body = el.createDiv({ cls: "codefile-body" });
		const fence = pickFence(content);
		const md = `${fence}${lang}\n${content}\n${fence}`;
		await MarkdownRenderer.render(app, md, body, this.ctx.sourcePath, this);
	}

	private renderHeader(file: TFile, rangeNote: string): void {
		const header = this.containerEl.createDiv({ cls: "codefile-header" });
		let label = file.path;
		if (this.ref?.start !== undefined) {
			const s = this.ref.start;
			const e = this.ref.end ?? s;
			label += e !== s ? `:${s}-${e}` : `:${s}`;
		}
		label += rangeNote;
		const link = header.createEl("a", {
			cls: "codefile-link",
			text: label,
			href: "#",
		});
		link.addEventListener("click", (ev) => {
			ev.preventDefault();
			void this.plugin.app.workspace.openLinkText(
				file.path,
				this.ctx.sourcePath,
			);
		});
	}

	private renderError(msg: string): void {
		this.containerEl.empty();
		this.containerEl.createDiv({
			cls: "codefile-error",
			text: `⚠ codefile: ${msg}`,
		});
	}
}
