import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTsConfigPaths } from "../../../../http/providers/agent-loader/tsconfig";

/**
 * Leftover: compilerOptions || {} — omitted/undefined compilerOptions still
 * yield { baseUrl: undefined, paths: undefined } (not {}).
 */
describe("parseTsConfigPaths missing compilerOptions leftover edges", () => {
	it("empty tsconfig object uses compilerOptions || {}", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-tsconfig-empty-"));
		writeFileSync(join(root, "tsconfig.json"), "{}");
		expect(parseTsConfigPaths(root)).toEqual({
			baseUrl: undefined,
			paths: undefined,
		});
	});

	it("explicit undefined compilerOptions still returns baseUrl/paths keys", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-tsconfig-undef-co-"));
		writeFileSync(
			join(root, "tsconfig.json"),
			JSON.stringify({ compilerOptions: undefined }),
		);
		expect(parseTsConfigPaths(root)).toEqual({
			baseUrl: undefined,
			paths: undefined,
		});
	});
});
