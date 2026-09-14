import { afterEach, describe, expect, it } from "vitest";
import { McpGeneric } from "../../../tools/mcp/servers";

/**
 * Twentieth leftover: thirteenth pins McpGeneric falsy `name ||` fallback.
 * Boolean `true` / `"true"` are kept; SameValueZero `-0` falls back.
 */
describe("mcp servers McpGeneric name true/negzero twentieth leftover", () => {
	const originalPath = process.env.PATH;

	afterEach(() => {
		if (originalPath === undefined) {
			delete process.env.PATH;
		} else {
			process.env.PATH = originalPath;
		}
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
	])("name $label is kept via ||", ({ value }) => {
		expect(
			(McpGeneric("@example/pkg", {}, value as any) as any).config.name,
		).toBe(value);
	});

	it("name SameValueZero -0 still falls back to package Client", () => {
		expect((McpGeneric("@example/pkg", {}, -0 as any) as any).config.name).toBe(
			"@example/pkg Client",
		);
	});

	it('name "false" kept (truthy string control vs thirteenth falsy)', () => {
		expect((McpGeneric("@example/pkg", {}, "false") as any).config.name).toBe(
			"false",
		);
	});
});
