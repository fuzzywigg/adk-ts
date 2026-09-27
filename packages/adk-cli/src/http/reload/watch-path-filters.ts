import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { DIRECTORIES_TO_SKIP } from "../providers/agent-scanner.service";

/**
 * Returns true when any path segment is a well-known skip directory
 * (node_modules, .git, dist, etc.).
 */
export function pathHasSkippedDir(p: string): boolean {
	const parts = p.split(sep).filter(Boolean);
	return parts.some((part) =>
		(DIRECTORIES_TO_SKIP as readonly string[]).includes(part),
	);
}

/**
 * Loads simple (non-glob) .gitignore entries as absolute path prefixes.
 * Comments, blanks, and glob metacharacter lines are skipped.
 */
export function loadGitignorePrefixes(rootDir: string): string[] {
	try {
		const igPath = resolve(rootDir, ".gitignore");
		if (!existsSync(igPath)) return [];
		const lines = readFileSync(igPath, "utf8").split("\n");
		const prefixes: string[] = [];
		for (const raw of lines) {
			const line = raw.trim();
			if (!line || line.startsWith("#")) continue;
			if (/[?*[\]]/.test(line)) continue;
			const normalized = line.replace(/\/+$/, "");
			const abs = resolve(rootDir, normalized);
			prefixes.push(abs + sep);
		}
		return prefixes;
	} catch {
		return [];
	}
}

/**
 * Ignore a watched path when it sits under a skipped directory or a
 * simple .gitignore prefix.
 */
export function shouldIgnorePath(
	fullPath: string,
	prefixes: string[],
): boolean {
	if (pathHasSkippedDir(fullPath)) return true;
	for (const pref of prefixes) {
		if (fullPath.startsWith(pref)) return true;
	}
	return false;
}
