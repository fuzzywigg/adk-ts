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
});
