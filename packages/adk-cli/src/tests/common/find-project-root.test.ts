import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findProjectRoot } from "../../common/find-project-root";

describe("findProjectRoot", () => {
	it("walks upward until it finds a package.json marker", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-root-"));
		writeFileSync(join(root, "package.json"), "{}");
		const nested = join(root, "apps", "demo");
		mkdirSync(nested, { recursive: true });

		expect(findProjectRoot(nested)).toBe(root.replace(/\\/g, "/"));
	});

	it("falls back to the start directory when no markers exist", () => {
		const start = mkdtempSync(join(tmpdir(), "adk-cli-empty-"));
		expect(findProjectRoot(start)).toBe(start.replace(/\\/g, "/"));
	});

	it("recognizes tsconfig.json, .env, and .git markers", () => {
		const tsRoot = mkdtempSync(join(tmpdir(), "adk-cli-ts-"));
		writeFileSync(join(tsRoot, "tsconfig.json"), "{}");
		const nestedTs = join(tsRoot, "nested");
		mkdirSync(nestedTs, { recursive: true });
		expect(findProjectRoot(nestedTs)).toBe(tsRoot.replace(/\\/g, "/"));

		const envRoot = mkdtempSync(join(tmpdir(), "adk-cli-env-"));
		writeFileSync(join(envRoot, ".env"), "A=1\n");
		const envChild = join(envRoot, "child");
		mkdirSync(envChild, { recursive: true });
		expect(findProjectRoot(envChild)).toBe(envRoot.replace(/\\/g, "/"));

		const gitRoot = mkdtempSync(join(tmpdir(), "adk-cli-git-"));
		mkdirSync(join(gitRoot, ".git"));
		const deep = join(gitRoot, "a", "b");
		mkdirSync(deep, { recursive: true });
		expect(findProjectRoot(deep)).toBe(gitRoot.replace(/\\/g, "/"));
	});
});
