import { afterEach, describe, expect, it } from "vitest";
import { McpAtp, McpMemory } from "../../../tools/mcp/servers";

/**
 * Twentieth leftover: nineteenth pins description/debug `"0"`/`"false"` keep.
 * Assert `||` also keeps boolean `true` / `"true"`; SameValueZero `-0` coalesces.
 */
describe("mcp servers debug/description/retry true/negzero twentieth leftover", () => {
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
	])("debug $label is kept via || (not coalesced to false)", ({ value }) => {
		expect((McpMemory({ debug: value as any }) as any).config.debug).toBe(
			value,
		);
	});

	it("debug SameValueZero -0 still coalesces to false", () => {
		expect((McpMemory({ debug: -0 as any }) as any).config.debug).toBe(false);
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
	])("description $label is kept via ||", ({ value }) => {
		expect(
			(McpMemory({ description: value as any }) as any).config.description,
		).toBe(value);
	});

	it("description SameValueZero -0 still coalesces to Client for …", () => {
		expect(
			(McpMemory({ description: -0 as any }) as any).config.description,
		).toBe("Client for Memory MCP Client");
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
	])("retryOptions $label is kept via || (no defaults merged)", ({ value }) => {
		expect(
			(McpAtp({ retryOptions: value as any }) as any).config.retryOptions,
		).toBe(value);
	});

	it("retryOptions SameValueZero -0 still coalesces to defaults", () => {
		expect(
			(McpAtp({ retryOptions: -0 as any }) as any).config.retryOptions,
		).toEqual({
			maxRetries: 2,
			initialDelay: 200,
		});
	});

	it('debug "false" still kept (nineteenth control)', () => {
		expect((McpMemory({ debug: "false" as any }) as any).config.debug).toBe(
			"false",
		);
	});
});
