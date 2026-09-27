import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { DIRECTORIES_TO_SKIP } from "../../../http/providers/agent-scanner.service";
import {
	loadGitignorePrefixes,
	pathHasSkippedDir,
	shouldIgnorePath,
} from "../../../http/reload/watch-path-filters";

describe("pathHasSkippedDir", () => {
	it("detects well-known skip directory segments", () => {
		expect(pathHasSkippedDir(join("proj", "node_modules", "pkg"))).toBe(true);
		expect(pathHasSkippedDir(join("proj", ".git", "objects"))).toBe(true);
		expect(pathHasSkippedDir(join("proj", "dist", "out.js"))).toBe(true);
		expect(pathHasSkippedDir(join("proj", ".adk-cache", "x.cjs"))).toBe(true);
	});

	it("returns false for ordinary project paths", () => {
		expect(pathHasSkippedDir(join("proj", "src", "agent.ts"))).toBe(false);
		expect(pathHasSkippedDir(join("proj", "agents", "demo"))).toBe(false);
	});

	it("matches every DIRECTORIES_TO_SKIP entry as a path segment", () => {
		for (const dir of DIRECTORIES_TO_SKIP) {
			expect(pathHasSkippedDir(join("root", dir, "nested"))).toBe(true);
		}
	});
});

describe("loadGitignorePrefixes", () => {
	it("returns empty array when .gitignore is missing", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-gitignore-miss-"));
		expect(loadGitignorePrefixes(root)).toEqual([]);
	});

	it("skips comments, blanks, and glob lines; strips trailing slashes", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-gitignore-parse-"));
		writeFileSync(
			join(root, ".gitignore"),
			[
				"# comment",
				"",
				"tmp/",
				"  build  ",
				"weird*[",
				"*.log",
				"coverage",
			].join("\n"),
		);

		const prefixes = loadGitignorePrefixes(root);
		expect(prefixes).toEqual([
			resolve(root, "tmp") + sep,
			resolve(root, "build") + sep,
			resolve(root, "coverage") + sep,
		]);
	});

	it("returns empty array when .gitignore cannot be read", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-gitignore-eisdir-"));
		mkdirSync(join(root, ".gitignore"));
		expect(loadGitignorePrefixes(root)).toEqual([]);
	});
});

describe("shouldIgnorePath", () => {
	it("ignores paths under skipped directories regardless of prefixes", () => {
		expect(shouldIgnorePath(join("/proj", "node_modules", "x.js"), [])).toBe(
			true,
		);
	});

	it("ignores paths that start with a gitignore prefix", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-ignore-prefix-"));
		const prefix = resolve(root, "tmp") + sep;
		expect(shouldIgnorePath(resolve(root, "tmp", "a.js"), [prefix])).toBe(true);
		expect(shouldIgnorePath(resolve(root, "src", "a.js"), [prefix])).toBe(
			false,
		);
	});

	it("does not ignore ordinary paths with empty prefixes", () => {
		expect(shouldIgnorePath(join("/proj", "src", "agent.ts"), [])).toBe(false);
	});
});
