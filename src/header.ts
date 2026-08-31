/** What the clickable header shows for an embed. */
export type HeaderStyle = "path" | "filename";

interface HeaderRange {
	start: number;
	end?: number;
}

/** Build the header label for an embed: path or basename, plus line range. */
export function formatHeaderLabel(
	path: string,
	range: HeaderRange | null,
	style: HeaderStyle,
): string {
	let label =
		style === "filename" ? (path.split(/[\\/]/).pop() ?? path) : path;
	if (range) {
		const end = range.end ?? range.start;
		label += end !== range.start ? `:${range.start}-${end}` : `:${range.start}`;
	}
	return label;
}
