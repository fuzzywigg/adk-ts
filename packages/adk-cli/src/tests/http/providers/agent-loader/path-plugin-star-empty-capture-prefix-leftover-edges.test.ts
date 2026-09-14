import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createPathMappingPlugin } from "../../../../http/providers/agent-loader/path-plugin";

function getHandler(plugin: ReturnType<typeof createPathMappingPlugin>) {
	const onResolve = vi.fn();
	plugin.setup({ onResolve });
	return onResolve.mock.calls[0][1] as (args: {
		path: string;
		importer: string;
		namespace: string;
		resolveDir: string;
		kind: string;
		pluginData: Record<string, string | number | boolean>;
	}) => { path: string } | undefined;
}

function resolveArgs(path: string, importer = "entry.ts") {
	return {
		path,
		importer,
		namespace: "file",
		resolveDir: "/",
		kind: "import-statement",
		pluginData: {},
	};
}

/**
 * Leftover: match[1] && mapping.includes("*") skips empty capture;
 * path === "env" is case-sensitive; replace("../","") once; importer || "unknown".
 */
describe("path-plugin star empty capture / env case leftover edges", () => {
	it("empty * capture does not substitute into mapping", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-path-star-"));
		const srcDir = join(root, "src");
		const libDir = join(srcDir, "lib");
		mkdirSync(libDir, { recursive: true });
		writeFileSync(join(libDir, "x.ts"), "export {};\n");
		writeFileSync(
			join(root, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					baseUrl: "./src",
					paths: { "@lib/*": ["lib/*"] },
				},
			}),
		);

		const debug = vi.fn();
		const plugin = createPathMappingPlugin(root, {
			logger: { debug } as never,
			quiet: false,
		});
		const handler = getHandler(plugin);

		expect(handler(resolveArgs("@lib/", ""))).toBeUndefined();
		expect(
			debug.mock.calls.some((c) => String(c[0]).includes('from "unknown"')),
		).toBe(true);
		expect(handler(resolveArgs("@lib/x"))?.path).toContain("x.ts");
	});

	it("ENV is not the case-sensitive env shortcut", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-path-env-case-"));
		const srcDir = join(root, "src");
		mkdirSync(srcDir, { recursive: true });
		writeFileSync(join(srcDir, "env.ts"), "export {};\n");
		writeFileSync(
			join(root, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: { baseUrl: "./src", paths: {} },
			}),
		);

		const plugin = createPathMappingPlugin(root, { quiet: true });
		const handler = getHandler(plugin);
		expect(handler(resolveArgs("ENV"))).toBeUndefined();
		expect(handler(resolveArgs("env"))?.path).toContain("env.ts");
	});

	it("only strips one ../ prefix for baseUrl relative resolve", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-path-dotdot-"));
		const srcDir = join(root, "src");
		mkdirSync(srcDir, { recursive: true });
		writeFileSync(join(srcDir, "foo.ts"), "export {};\n");
		writeFileSync(
			join(root, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: { baseUrl: "./src", paths: {} },
			}),
		);

		const plugin = createPathMappingPlugin(root, { quiet: true });
		const handler = getHandler(plugin);

		expect(handler(resolveArgs("../../foo"))).toBeUndefined();
		expect(handler(resolveArgs("../foo"))?.path).toContain("foo.ts");
	});

	it("empty baseUrl is falsy so resolvedBaseUrl falls back to projectRoot", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-path-empty-base-"));
		mkdirSync(join(root, "lib"), { recursive: true });
		writeFileSync(join(root, "lib", "util.ts"), "export {};\n");
		writeFileSync(
			join(root, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					baseUrl: "",
					paths: { "@lib/*": ["lib/*"] },
				},
			}),
		);

		const plugin = createPathMappingPlugin(root, { quiet: true });
		const handler = getHandler(plugin);
		expect(handler(resolveArgs("@lib/util"))?.path).toContain("util.ts");
	});
});
