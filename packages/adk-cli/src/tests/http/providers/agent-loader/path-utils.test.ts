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
	});
});
