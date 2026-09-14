import { describe, expect, it } from "vitest";
import { LoadArtifactsTool } from "../../../tools/common/load-artifacts-tool";
import type { ToolContext } from "../../../tools/tool-context";

/**
 * Nineteenth leftover: `args.artifact_names || []` — string "0"/"false" are
 * truthy and kept (fifth covers other truthy non-arrays; sixth covers falsy).
 */
describe("load-artifacts names string-zero/false keep nineteenth leftover", () => {
	it.each([
		"0",
		"false",
	] as const)("artifact_names: %j kept via || []", async (value) => {
		const tool = new LoadArtifactsTool();
		await expect(
			tool.runAsync({ artifact_names: value as any }, {
				actions: {},
			} as ToolContext),
		).resolves.toEqual({ artifact_names: value });
	});

	it.each([
		{ label: "empty string", value: "" },
		{ label: "0", value: 0 },
		{ label: "false", value: false },
	] as const)("falsy artifact_names ($label) still coalesces to []", async ({
		value,
	}) => {
		const tool = new LoadArtifactsTool();
		await expect(
			tool.runAsync({ artifact_names: value as any }, {
				actions: {},
			} as ToolContext),
		).resolves.toEqual({ artifact_names: [] });
	});
});
