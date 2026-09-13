import { mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
	createExternalizePlugin,
	isRebuildNeeded,
} from "../../../../http/providers/agent-loader/build-utils";

describe("createExternalizePlugin", () => {
	it("marks bare imports as external", () => {
		const plugin = createExternalizePlugin(["@iqai/adk"], ["@iqai/"]);
		const onResolve = vi.fn();
		plugin.setup({ onResolve } as never);

		const handler = onResolve.mock.calls[0][1];
		expect(handler({ path: "zod" })).toEqual({ path: "zod", external: true });
		expect(handler({ path: "@iqai/adk" })).toEqual({
			path: "@iqai/adk",
			external: true,
		});
		expect(handler({ path: "./local" })).toBeUndefined();
		expect(handler({ path: "/abs" })).toBeUndefined();
		expect(handler({ path: "C:\\windows\\path" })).toBeUndefined();
	});
});

describe("isRebuildNeeded", () => {
	it("returns true when output file is missing", () => {
		expect(
			isRebuildNeeded(
				"/tmp/does-not-exist-adk-out.cjs",
				"/tmp/does-not-exist-adk-src.ts",
				"/tmp/does-not-exist-adk-tsconfig.json",
			),
		).toBe(true);
	});

	it("returns false when output is newer than source and tsconfig", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-build-"));
		const outFile = join(root, "out.cjs");
		const sourceFile = join(root, "src.ts");
		const tsconfigPath = join(root, "tsconfig.json");

		writeFileSync(sourceFile, "export {}");
		writeFileSync(tsconfigPath, "{}");
		writeFileSync(outFile, "module.exports = {}");

		const now = Date.now() / 1000;
		utimesSync(sourceFile, now - 20, now - 20);
		utimesSync(tsconfigPath, now - 20, now - 20);
		utimesSync(outFile, now - 5, now - 5);

		const logger = { debug: vi.fn(), warn: vi.fn() };
		expect(isRebuildNeeded(outFile, sourceFile, tsconfigPath, logger)).toBe(
			false,
		);
		expect(logger.debug).toHaveBeenCalled();
	});

	it("returns true when source is newer than output", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-build-stale-"));
		const outFile = join(root, "out.cjs");
		const sourceFile = join(root, "src.ts");
		const tsconfigPath = join(root, "tsconfig.json");

		writeFileSync(outFile, "module.exports = {}");
		writeFileSync(sourceFile, "export {}");
		writeFileSync(tsconfigPath, "{}");

		const now = Date.now() / 1000;
		utimesSync(outFile, now - 20, now - 20);
		utimesSync(sourceFile, now - 5, now - 5);
		utimesSync(tsconfigPath, now - 30, now - 30);

		expect(
			isRebuildNeeded(outFile, sourceFile, tsconfigPath, undefined, true),
		).toBe(true);
	});

	it("returns true when tsconfig is newer than output", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-build-tsconfig-"));
		const outFile = join(root, "out.cjs");
		const sourceFile = join(root, "src.ts");
		const tsconfigPath = join(root, "tsconfig.json");

		writeFileSync(outFile, "module.exports = {}");
		writeFileSync(sourceFile, "export {}");
		writeFileSync(tsconfigPath, "{}");

		const now = Date.now() / 1000;
		utimesSync(outFile, now - 20, now - 20);
		utimesSync(sourceFile, now - 30, now - 30);
		utimesSync(tsconfigPath, now - 5, now - 5);

		expect(isRebuildNeeded(outFile, sourceFile, tsconfigPath)).toBe(true);
	});

	it("keeps allowlisted scoped packages external via prefix", () => {
		const plugin = createExternalizePlugin([], ["@iqai/"]);
		const onResolve = vi.fn();
		plugin.setup({ onResolve } as never);
		const handler = onResolve.mock.calls[0][1];
		expect(handler({ path: "@iqai/adk" })).toEqual({
			path: "@iqai/adk",
			external: true,
		});
		expect(handler({ path: "lodash" })).toEqual({
			path: "lodash",
			external: true,
		});
	});
});
