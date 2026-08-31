import { parseCodeFileSource } from "./parser";

/** A vault file resolved from a codefile spec. */
export interface ResolvedFile {
	/** Vault path of the resolved file (used for language inference). */
	path: string;
	/** Full text content of the file. */
	content: string;
}

/** Resolver outcome: the file, a message explaining refusal, or not found. */
export type ResolveResult = ResolvedFile | { error: string } | null;

export interface BakeOptions {
	/** Resolve an Obsidian-style linkpath to a file, or null when not found. */
	resolve: (linkpath: string) => ResolveResult | Promise<ResolveResult>;
	/** Map a resolved file path to a fence language id. */
	langFor: (path: string) => string;
}

export interface BakeResult {
	output: string;
	/** Number of blocks written (converted or refreshed). */
	bakedCount: number;
	/** Blocks skipped because the spec or file was unusable. */
	errors: string[];
	/** Blocks baked with a caveat (e.g. range outside the file). */
	warnings: string[];
}

export interface UnbakeResult {
	output: string;
	unbakedCount: number;
}

// Control chars that never appear in text files: NUL..BS and SO..US.
// eslint-disable-next-line no-control-regex -- detecting control bytes is the whole point of the binary-file heuristic
export const BINARY_RE = /[\x00-\x08\x0e-\x1f]/;

const FENCE_OPEN_RE = /^(\s{0,3})([`~]{3,})(.*)$/;
/** Fence info of a live block: `codefile` optionally followed by the spec. */
const CODEFILE_INFO_RE = /^codefile(?:\s+(.*))?$/i;
/** Fence info of a baked block: `<lang> codefile:<spec>`. */
const BAKED_INFO_RE = /^\S+\s+codefile:\s*(.+?)\s*$/i;

/** Choose a backtick fence longer than any backtick run inside the content. */
export function pickFence(content: string): string {
	let longest = 0;
	const runs = content.match(/`+/g);
	if (runs) {
		for (const run of runs) longest = Math.max(longest, run.length);
	}
	return "`".repeat(Math.max(3, longest + 1));
}

interface Fence {
	indent: string;
	marker: string;
	info: string;
	/** Index of the opening fence line. */
	open: number;
	/** Index of the closing fence line. */
	close: number;
}

/** Find all top-level closed fences in the given lines. */
function findFences(lines: string[]): Fence[] {
	const fences: Fence[] = [];
	let i = 0;
	while (i < lines.length) {
		const m = lines[i].match(FENCE_OPEN_RE);
		if (!m) {
			i++;
			continue;
		}
		const [, indent, marker, info] = m;
		const closeRe = new RegExp(
			`^\\s{0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}\\s*$`,
		);
		let close = -1;
		for (let j = i + 1; j < lines.length; j++) {
			if (closeRe.test(lines[j])) {
				close = j;
				break;
			}
		}
		if (close === -1) break; // unterminated fence runs to EOF; leave as-is
		fences.push({ indent, marker, info: info.trim(), open: i, close });
		i = close + 1;
	}
	return fences;
}

/** Slice content to the ref's 1-based inclusive range, mirroring live render. */
function sliceRange(
	content: string,
	start: number | undefined,
	end: number | undefined,
): { content: string; outOfRange: boolean } {
	if (start === undefined) return { content, outOfRange: false };
	const lines = content.split("\n");
	let s = start;
	let e = end ?? start;
	if (s > e) [s, e] = [e, s];
	if (s < 1) s = 1;
	if (s > lines.length) return { content, outOfRange: true };
	return {
		content: lines.slice(s - 1, Math.min(e, lines.length)).join("\n"),
		outOfRange: false,
	};
}

/**
 * Bake `codefile` blocks into plain language fences that render anywhere
 * (Obsidian Publish included), and refresh blocks baked earlier.
 *
 * Live block   -> ```<lang> codefile:<spec>  with the code as the body.
 * Baked block  -> body refreshed from the source file.
 * Everything else is left byte-for-byte untouched.
 */
export async function bakeMarkdown(
	md: string,
	options: BakeOptions,
): Promise<BakeResult> {
	const lines = md.split("\n");
	const result: BakeResult = {
		output: md,
		bakedCount: 0,
		errors: [],
		warnings: [],
	};

	const out: string[] = [];
	let cursor = 0;

	for (const fence of findFences(lines)) {
		let spec: string | null = null;
		const codefileMatch = fence.info.match(CODEFILE_INFO_RE);
		const bakedMatch = fence.info.match(BAKED_INFO_RE);

		if (codefileMatch) {
			spec = codefileMatch[1]?.trim() ?? "";
			if (!spec) {
				// Spec-in-body form: first non-empty body line.
				for (let j = fence.open + 1; j < fence.close; j++) {
					const line = lines[j].trim();
					if (line) {
						spec = line;
						break;
					}
				}
			}
		} else if (bakedMatch) {
			spec = bakedMatch[1];
		} else {
			continue;
		}

		const ref = spec ? parseCodeFileSource(spec) : null;
		if (!ref) {
			result.errors.push(`spec inválido: ${spec || "(vazio)"}`);
			continue;
		}
		const dest = await options.resolve(ref.linkpath);
		if (!dest) {
			result.errors.push(`arquivo não encontrado: ${ref.linkpath}`);
			continue;
		}
		if ("error" in dest) {
			result.errors.push(dest.error);
			continue;
		}

		const sliced = sliceRange(dest.content, ref.start, ref.end);
		if (sliced.outOfRange) {
			result.warnings.push(
				`faixa fora do arquivo em ${ref.linkpath} — arquivo inteiro embutido`,
			);
		}

		const lang = options.langFor(dest.path);
		const newFence = pickFence(sliced.content);
		const body = sliced.content
			.split("\n")
			.map((l) => fence.indent + l);

		out.push(...lines.slice(cursor, fence.open));
		out.push(`${fence.indent}${newFence}${lang} codefile:${spec}`);
		out.push(...body);
		out.push(`${fence.indent}${newFence}`);
		cursor = fence.close + 1;
		result.bakedCount++;
	}

	if (result.bakedCount === 0 && result.errors.length === 0) {
		return result;
	}
	out.push(...lines.slice(cursor));
	result.output = out.join("\n");
	return result;
}

/**
 * Extract the spec from a baked fence line
 * (```<lang> codefile:<spec>), or null when the line is not one.
 */
export function parseBakedFenceLine(line: string): string | null {
	const m = line.match(FENCE_OPEN_RE);
	if (!m) return null;
	const info = m[3].trim().match(BAKED_INFO_RE);
	return info ? info[1] : null;
}

/** Convert baked blocks back into empty `codefile` blocks. */
export function unbakeMarkdown(md: string): UnbakeResult {
	const lines = md.split("\n");
	const out: string[] = [];
	let cursor = 0;
	let unbakedCount = 0;

	for (const fence of findFences(lines)) {
		const bakedMatch = fence.info.match(BAKED_INFO_RE);
		if (!bakedMatch) continue;

		out.push(...lines.slice(cursor, fence.open));
		out.push(`${fence.indent}\`\`\`codefile ${bakedMatch[1]}`);
		out.push(`${fence.indent}\`\`\``);
		cursor = fence.close + 1;
		unbakedCount++;
	}

	if (unbakedCount === 0) {
		return { output: md, unbakedCount: 0 };
	}
	out.push(...lines.slice(cursor));
	return { output: out.join("\n"), unbakedCount };
}
