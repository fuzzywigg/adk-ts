import { readFileSync } from "node:fs";

/**
 * Extracts an agent name from source text via `name: "..."/`name: '...'`.
 * Empty quoted names are treated as absent (falsy capture → null).
 */
export function extractAgentNameFromContent(content: string): string | null {
	const nameMatch = content.match(/name\s*:\s*["']([^"']+)["']/);
	if (nameMatch?.[1]) {
		return nameMatch[1];
	}
	return null;
}

/**
 * Reads an agent file and extracts its name. Returns null on I/O failure
 * or when no usable quoted name is present so callers can fall back.
 */
export function extractAgentNameFromFile(filePath: string): string | null {
	try {
		const content = readFileSync(filePath, "utf-8");
		return extractAgentNameFromContent(content);
	} catch (_error) {
		return null;
	}
}
