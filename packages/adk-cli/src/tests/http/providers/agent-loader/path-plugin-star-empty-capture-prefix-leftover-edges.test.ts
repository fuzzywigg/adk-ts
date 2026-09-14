import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createPathMappingPlugin } from "../../../../http/providers/agent-loader/path-plugin";

type OnResolve = (args: {
	path: string;
	importer?: string;
}) => { path: string } | undefined;

function getOnResolve(plugin: {
	setup: (build: { onResolve: (opts: unknown, cb: OnResolve) => void }) => void;
}): OnResolve {
	let handler: OnResolve | undefined;
	plugin.setup({
		onResolve: (_opts, cb) => {
			handler = cb;
		},
	});
	if (!handler) throw new Error("onResolve not registered");
	return handler;
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
		const onResolve = getOnResolve(plugin);

		// "@lib/" → match[1] === "" → falsy → resolvedPath stays "lib/*" → miss
		expect(onResolve({ path: "@lib/", importer: "" })).toBeUndefined();
		expect(
			debug.mock.calls.some((c) => String(c[0]).includes('from "unknown"')),
		).toBe(true);

		// Non-empty capture still works
		expect(onResolve({ path: "@lib/x" })?.path).toContain("x.ts");
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
		const onResolve = getOnResolve(plugin);
		expect(onResolve({ path: "ENV" })).toBeUndefined();
		expect(onResolve({ path: "env" })?.path).toContain("env.ts");
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
		const onResolve = getOnResolve(plugin);

		expect(onResolve({ path: "../../foo" })).toBeUndefined();
		expect(onResolve({ path: "../foo" })?.path).toContain("foo.ts");
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
		const onResolve = getOnResolve(plugin);
		expect(onResolve({ path: "@lib/util" })?.path).toContain("util.ts");
	});
});
