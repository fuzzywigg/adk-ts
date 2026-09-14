import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createPathMappingPlugin } from "../../../../http/providers/agent-loader/path-plugin";
import { parseTsConfigPaths } from "../../../../http/providers/agent-loader/tsconfig";
import { normalizePathForEsbuild } from "../../../../http/providers/agent-loader/utils";

describe("path-plugin leftover edges (TOKENMAXX adk-cli)", () => {
	it("parses tsconfig with missing compilerOptions as empty paths", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-tsconfig-empty-opts-"));
		writeFileSync(join(root, "tsconfig.json"), JSON.stringify({}));
		expect(parseTsConfigPaths(root)).toEqual({
			baseUrl: undefined,
			paths: undefined,
		});
	});

	it("debug-logs unresolved imports when quiet is false", () => {
		const debug = vi.fn();
		const plugin = createPathMappingPlugin(tmpdir(), {
			logger: { debug } as never,
			quiet: false,
		});
		const onResolve = vi.fn();
		plugin.setup({ onResolve });
		const handler = onResolve.mock.calls[0][1];
		expect(
			handler({
				path: "./relative",
				importer: "",
				namespace: "file",
				resolveDir: tmpdir(),
				kind: "import-statement",
				pluginData: {},
			}),
		).toBeUndefined();
		expect(debug).toHaveBeenCalledWith(
			expect.stringContaining('from "unknown"'),
		);
	});

	it("resolves exact aliases without stars and ../ imports via baseUrl", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-path-plugin-rel-"));
		const srcDir = join(root, "src");
		mkdirSync(srcDir, { recursive: true });
		writeFileSync(join(srcDir, "exact.ts"), "export const e = 1;\n");
		writeFileSync(join(srcDir, "up.ts"), "export const u = 1;\n");
		writeFileSync(
			join(root, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					baseUrl: "./src",
					paths: { "@exact": ["exact.ts"] },
				},
			}),
		);

		const debug = vi.fn();
		const plugin = createPathMappingPlugin(root, {
			logger: { debug } as never,
			quiet: false,
		});
		const onResolve = vi.fn();
		plugin.setup({ onResolve });
		const handler = onResolve.mock.calls[0][1];

		const exact = handler({
			path: "@exact",
			importer: "entry.ts",
			namespace: "file",
			resolveDir: root,
			kind: "import-statement",
			pluginData: {},
		});
		expect(exact?.path).toBe(normalizePathForEsbuild(join(srcDir, "exact.ts")));

		const relative = handler({
			path: "../up",
			importer: "entry.ts",
			namespace: "file",
			resolveDir: root,
			kind: "import-statement",
			pluginData: {},
		});
		expect(relative?.path).toBe(normalizePathForEsbuild(join(srcDir, "up.ts")));
		expect(debug).toHaveBeenCalled();
	});

	it("returns undefined when mapped files and env files are missing", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-path-plugin-miss-"));
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

		expect(
			handler({
				path: "@lib/missing",
				importer: "entry.ts",
				namespace: "file",
				resolveDir: root,
				kind: "import-statement",
				pluginData: {},
			}),
		).toBeUndefined();
		expect(
			handler({
				path: "env",
				importer: "entry.ts",
				namespace: "file",
				resolveDir: root,
				kind: "import-statement",
				pluginData: {},
			}),
		).toBeUndefined();
	});
});
