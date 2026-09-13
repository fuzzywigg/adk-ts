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
});
