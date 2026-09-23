export const GITHUB_LANGUAGE_COLORS: Record<string, string> = {
	TypeScript: "#3178c6",
	JavaScript: "#f1e05a",
	Rust: "#dea584",
	HTML: "#e34c26",
	CSS: "#563d7c",
	Shell: "#89e051",
	Python: "#3572a5",
	Go: "#00add8",
	Lua: "#000080",
	C: "#555555",
	"C++": "#f34b7d",
};

const aliases: Record<string, string> = {
	"html & css": "CSS",
	shell: "Shell",
};

export function languageName(name: string) {
	return aliases[name.trim().toLowerCase()] ?? name.trim();
}

export function languageColor(name: string) {
	return GITHUB_LANGUAGE_COLORS[languageName(name)] ?? "var(--accent)";
}
