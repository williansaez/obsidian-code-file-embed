/** What the clickable header shows for an embed. */
export type HeaderStyle = "path" | "filename" | "relative";

interface HeaderRange {
	start: number;
	end?: number;
}

/**
 * Path of `target` relative to the folder holding `from`, both vault paths.
 * Climbs with `../` when the target sits outside that folder, so the label
 * stays honest about where the file lives (issue #5).
 */
export function relativeVaultPath(target: string, from: string): string {
	const split = (p: string) => p.split(/[\\/]/).filter((s) => s.length > 0);
	const fromDir = split(from).slice(0, -1);
	const to = split(target);
	let common = 0;
	while (
		common < fromDir.length &&
		common < to.length &&
		fromDir[common] === to[common]
	) {
		common++;
	}
	const ups = fromDir.length - common;
	return [...Array<string>(ups).fill(".."), ...to.slice(common)].join("/");
}

/**
 * Build the header label for an embed: path, basename or path relative to
 * the note (`notePath`), plus line range. Relative needs the note path;
 * without it the label falls back to the full vault path.
 */
export function formatHeaderLabel(
	path: string,
	range: HeaderRange | null,
	style: HeaderStyle,
	notePath?: string,
): string {
	let label: string;
	if (style === "filename") {
		label = path.split(/[\\/]/).pop() ?? path;
	} else if (style === "relative" && notePath) {
		label = relativeVaultPath(path, notePath);
	} else {
		label = path;
	}
	if (range) {
		const end = range.end ?? range.start;
		label += end !== range.start ? `:${range.start}-${end}` : `:${range.start}`;
	}
	return label;
}
