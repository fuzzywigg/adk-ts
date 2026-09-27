import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Logger } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PathUtils } from "../../../../http/providers/agent-loader/path-utils";

describe("PathUtils", () => {
	const utils = new PathUtils(new Logger("PathUtilsTest"), true);

	it("normalizes backslashes to forward slashes", () => {
		expect(utils.normalizePath("a\\b\\c")).toBe("a/b/c");
	});

	it("returns empty config when tsconfig is missing", () => {
		expect(utils.parseTsConfigPaths("/tmp/does-not-exist-adk-cli")).toEqual({});
	});

	it("marks bare imports as external in the esbuild plugin", () => {
		const plugin = utils.createExternalizePlugin();
		const onResolve = vi.fn();
		plugin.setup({ onResolve });

		const handler = onResolve.mock.calls[0][1];
		expect(handler({ path: "zod" })).toEqual({ path: "zod", external: true });
		expect(handler({ path: "./local" })).toBeUndefined();
		expect(handler({ path: "/abs" })).toBeUndefined();
		expect(handler({ path: "C:\\windows\\path" })).toBeUndefined();
	});

	it("parses tsconfig paths and warns on malformed JSON", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-tsconfig-"));
		writeFileSync(
			join(root, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					baseUrl: "./src",
					paths: { "@/*": ["./*"] },
				},
			}),
		);
		expect(utils.parseTsConfigPaths(root)).toEqual({
			baseUrl: "./src",
			paths: { "@/*": ["./*"] },
		});

		const badRoot = mkdtempSync(join(tmpdir(), "adk-cli-bad-tsconfig-"));
		writeFileSync(join(badRoot, "tsconfig.json"), "{not-json");
		const warn = vi.fn();
		const noisy = new PathUtils({ warn } as unknown as Logger, true);
		expect(noisy.parseTsConfigPaths(badRoot)).toEqual({});
		expect(warn).toHaveBeenCalled();
	});

	it("maps path aliases when the target file exists", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-pathmap-"));
		mkdirSync(join(root, "src", "lib"), { recursive: true });
		writeFileSync(join(root, "src", "lib", "util.ts"), "export const x = 1;");
		writeFileSync(
			join(root, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					baseUrl: ".",
					paths: {
						"@lib/*": ["src/lib/*"],
						"@exact": ["src/lib/util.ts"],
					},
				},
			}),
		);

		const plugin = utils.createPathMappingPlugin(root);
		const onResolve = vi.fn();
		plugin.setup({ onResolve });
		const handler = onResolve.mock.calls[0][1];

		const mapped = handler({ path: "@lib/util", importer: "agent.ts" });
		expect(mapped?.path).toContain("util.ts");

		const exact = handler({ path: "@exact", importer: "agent.ts" });
		expect(exact?.path).toContain("util.ts");

		expect(
			handler({ path: "./relative", importer: "agent.ts" }),
		).toBeUndefined();
		expect(
			handler({ path: "@missing/thing", importer: "agent.ts" }),
		).toBeUndefined();
	});

	it("probes .js / .tsx / extensionless targets in order after .ts miss", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-pathmap-ext-"));
		mkdirSync(join(root, "src"), { recursive: true });
		writeFileSync(join(root, "src", "compiled.js"), "export const j = 1;");
		writeFileSync(join(root, "src", "component.tsx"), "export const c = 1;");
		writeFileSync(join(root, "src", "bare"), "export const b = 1;");
		writeFileSync(
			join(root, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					baseUrl: ".",
					paths: {
						"@js": ["src/compiled"],
						"@tsx": ["src/component"],
						"@bare": ["src/bare"],
					},
				},
			}),
		);

		const plugin = utils.createPathMappingPlugin(root);
		const onResolve = vi.fn();
		plugin.setup({ onResolve });
		const handler = onResolve.mock.calls[0][1];

		expect(handler({ path: "@js", importer: "a.ts" })?.path).toBe(
			join(root, "src", "compiled.js"),
		);
		expect(handler({ path: "@tsx", importer: "a.ts" })?.path).toBe(
			join(root, "src", "component.tsx"),
		);
		expect(handler({ path: "@bare", importer: "a.ts" })?.path).toBe(
			join(root, "src", "bare"),
		);
	});

	it("falls through to a later path mapping when the first target is missing", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-pathmap-multi-"));
		mkdirSync(join(root, "fallback"), { recursive: true });
		writeFileSync(join(root, "fallback", "hit.ts"), "export const h = 1;");
		writeFileSync(
			join(root, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					baseUrl: ".",
					paths: {
						"@mod": ["missing/first.ts", "fallback/hit.ts"],
					},
				},
			}),
		);

		const plugin = utils.createPathMappingPlugin(root);
		const onResolve = vi.fn();
		plugin.setup({ onResolve });
		const handler = onResolve.mock.calls[0][1];

		expect(handler({ path: "@mod", importer: "a.ts" })?.path).toBe(
			join(root, "fallback", "hit.ts"),
		);
	});

	it("resolves aliases against projectRoot when baseUrl is omitted", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-pathmap-nobase-"));
		mkdirSync(join(root, "lib"), { recursive: true });
		writeFileSync(join(root, "lib", "tool.ts"), "export const t = 1;");
		writeFileSync(
			join(root, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					paths: { "@tool": ["lib/tool.ts"] },
				},
			}),
		);

		const plugin = utils.createPathMappingPlugin(root);
		const onResolve = vi.fn();
		plugin.setup({ onResolve });
		const handler = onResolve.mock.calls[0][1];

		expect(handler({ path: "@tool", importer: "a.ts" })?.path).toBe(
			join(root, "lib", "tool.ts"),
		);
	});

	it("logs debug resolves when quiet is false", () => {
		const debug = vi.fn();
		const noisy = new PathUtils({ debug } as unknown as Logger, false);
		const root = mkdtempSync(join(tmpdir(), "adk-cli-pathmap-debug-"));
		writeFileSync(
			join(root, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					baseUrl: ".",
					paths: { "@x": ["nope.ts"] },
				},
			}),
		);

		const plugin = noisy.createPathMappingPlugin(root);
		const onResolve = vi.fn();
		plugin.setup({ onResolve });
		const handler = onResolve.mock.calls[0][1];

		handler({ path: "@x", importer: "entry.ts" });
		expect(debug).toHaveBeenCalledWith(
			expect.stringContaining('Resolving import: "@x" from "entry.ts"'),
		);
	});
});
