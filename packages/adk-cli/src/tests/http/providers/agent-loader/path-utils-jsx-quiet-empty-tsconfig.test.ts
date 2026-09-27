import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Logger } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PathUtils } from "../../../../http/providers/agent-loader/path-utils";

/**
 * Residual PathUtils gaps after #317:
 * - .jsx in the extension probe loop (sibling of covered .js/.tsx/bare)
 * - quiet=true must suppress resolve debug logs
 * - empty/missing compilerOptions must not throw and yields no mappings
 */
describe("PathUtils resolve residuals", () => {
	it("probes .jsx when earlier extensions miss", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-pathmap-jsx-"));
		mkdirSync(join(root, "src"), { recursive: true });
		writeFileSync(join(root, "src", "widget.jsx"), "export const w = 1;");
		writeFileSync(
			join(root, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					baseUrl: ".",
					paths: { "@widget": ["src/widget"] },
				},
			}),
		);

		const utils = new PathUtils(new Logger("PathUtilsJsx"), true);
		const plugin = utils.createPathMappingPlugin(root);
		const onResolve = vi.fn();
		plugin.setup({ onResolve });
		const handler = onResolve.mock.calls[0][1];

		expect(handler({ path: "@widget", importer: "a.ts" })?.path).toBe(
			join(root, "src", "widget.jsx"),
		);
	});

	it("suppresses debug logging when quiet is true", () => {
		const debug = vi.fn();
		const quiet = new PathUtils({ debug } as unknown as Logger, true);
		const root = mkdtempSync(join(tmpdir(), "adk-cli-pathmap-quiet-"));
		writeFileSync(
			join(root, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					baseUrl: ".",
					paths: { "@x": ["nope.ts"] },
				},
			}),
		);

		const plugin = quiet.createPathMappingPlugin(root);
		const onResolve = vi.fn();
		plugin.setup({ onResolve });
		const handler = onResolve.mock.calls[0][1];

		handler({ path: "@x", importer: "entry.ts" });
		expect(debug).not.toHaveBeenCalled();
	});

	it("treats empty tsconfig (no compilerOptions) as no path mappings", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-pathmap-empty-opts-"));
		writeFileSync(join(root, "tsconfig.json"), JSON.stringify({}));

		const utils = new PathUtils(new Logger("PathUtilsEmptyOpts"), true);
		expect(utils.parseTsConfigPaths(root)).toEqual({
			baseUrl: undefined,
			paths: undefined,
		});

		const plugin = utils.createPathMappingPlugin(root);
		const onResolve = vi.fn();
		plugin.setup({ onResolve });
		const handler = onResolve.mock.calls[0][1];

		expect(
			handler({ path: "@anything", importer: "agent.ts" }),
		).toBeUndefined();
	});
});
