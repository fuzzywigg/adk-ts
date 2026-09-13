import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createPathMappingPlugin } from "../../../../http/providers/agent-loader/path-plugin";
import { parseTsConfigPaths } from "../../../../http/providers/agent-loader/tsconfig";
import { normalizePathForEsbuild } from "../../../../http/providers/agent-loader/utils";

describe("normalizePathForEsbuild", () => {
	it("converts backslashes to forward slashes", () => {
		expect(normalizePathForEsbuild("C:\\proj\\src\\a.ts")).toBe(
			"C:/proj/src/a.ts",
		);
	});
});

describe("parseTsConfigPaths", () => {
	it("returns empty object when tsconfig is missing", () => {
		expect(parseTsConfigPaths(join(tmpdir(), "missing-adk-tsconfig"))).toEqual(
			{},
		);
	});

	it("parses baseUrl and paths from tsconfig.json", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-tsconfig-"));
		writeFileSync(
			join(root, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					baseUrl: "./src",
					paths: { "@lib/*": ["lib/*"] },
				},
			}),
		);

		expect(parseTsConfigPaths(root)).toEqual({
			baseUrl: "./src",
			paths: { "@lib/*": ["lib/*"] },
		});
	});

	it("returns empty object and warns on invalid JSON", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-tsconfig-bad-"));
		writeFileSync(join(root, "tsconfig.json"), "{ not-json");
		const warn = vi.fn();

		expect(parseTsConfigPaths(root, { warn } as never)).toEqual({});
		expect(warn).toHaveBeenCalled();
	});
});

describe("createPathMappingPlugin", () => {
	it("resolves aliased imports when the mapped file exists", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-path-plugin-"));
		const srcDir = join(root, "src");
		const libDir = join(srcDir, "lib");
		mkdirSync(libDir, { recursive: true });
		writeFileSync(join(libDir, "util.ts"), "export const x = 1;\n");
		writeFileSync(
			join(root, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					baseUrl: "./src",
					paths: { "@lib/*": ["lib/*"] },
				},
			}),
		);

		const plugin = createPathMappingPlugin(root, { quiet: true });
		const onResolve = vi.fn();
		plugin.setup({ onResolve });
		const handler = onResolve.mock.calls[0][1];

		const result = handler({
			path: "@lib/util",
			importer: "entry.ts",
			namespace: "file",
			resolveDir: root,
			kind: "import-statement",
			pluginData: {},
		});

		expect(result?.path).toBe(
			normalizePathForEsbuild(join(srcDir, "lib", "util.ts")),
		);
	});

	it("resolves direct env imports via baseUrl", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-path-env-"));
		const srcDir = join(root, "src");
		mkdirSync(srcDir, { recursive: true });
		writeFileSync(join(srcDir, "env.ts"), "export const e = 1;\n");
		writeFileSync(
			join(root, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: { baseUrl: "./src" },
			}),
		);

		const plugin = createPathMappingPlugin(root, { quiet: true });
		const onResolve = vi.fn();
		plugin.setup({ onResolve });
		const handler = onResolve.mock.calls[0][1];

		const result = handler({
			path: "env",
			importer: "entry.ts",
			namespace: "file",
			resolveDir: root,
			kind: "import-statement",
			pluginData: {},
		});

		expect(result?.path).toBe(normalizePathForEsbuild(join(srcDir, "env.ts")));
	});
});
