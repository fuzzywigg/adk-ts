import { mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isRebuildNeeded } from "../../../../http/providers/agent-loader/build-utils";

/**
 * Leftover: missing tsconfig → tsconfigMtime = 0; fresh out still reusable.
 */
describe("isRebuildNeeded missing tsconfig mtime 0 leftover edges", () => {
	it("returns false when out is newer than source and tsconfig is absent", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-build-no-tsconfig-"));
		const outFile = join(root, "out.cjs");
		const sourceFile = join(root, "src.ts");
		const missingTsconfig = join(root, "tsconfig.json");

		writeFileSync(sourceFile, "export {}");
		writeFileSync(outFile, "module.exports = {}");

		const now = Date.now() / 1000;
		utimesSync(sourceFile, now - 20, now - 20);
		utimesSync(outFile, now - 5, now - 5);

		expect(
			isRebuildNeeded(outFile, sourceFile, missingTsconfig, undefined, true),
		).toBe(false);
	});
});
