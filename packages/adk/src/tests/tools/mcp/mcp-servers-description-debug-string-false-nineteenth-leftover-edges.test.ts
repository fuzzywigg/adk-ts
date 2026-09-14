import { afterEach, describe, expect, it } from "vitest";
import { McpMemory } from "../../../tools/mcp/servers";

/**
 * Nineteenth leftover: createMcpConfig `description ||` / `debug || false` —
 * string "false" (and description "0") kept. Thirteenth already pins debug "0"
 * and falsy description coalesce / whitespace keep.
 */
describe("mcp servers description/debug string-false nineteenth leftover", () => {
	const originalPath = process.env.PATH;

	afterEach(() => {
		if (originalPath === undefined) {
			delete process.env.PATH;
		} else {
			process.env.PATH = originalPath;
		}
	});

	it.each([
		"0",
		"false",
	] as const)('description: %j kept via || (unlike "" → Client for …)', (description) => {
		const config = (McpMemory({ description }) as any).config;
		expect(config.description).toBe(description);
	});

	it('debug: "false" kept via || (truthy string, unlike boolean false)', () => {
		expect((McpMemory({ debug: "false" as any }) as any).config.debug).toBe(
			"false",
		);
	});

	it("falsy description still coalesces to Client for Memory MCP Client (control)", () => {
		const config = (McpMemory({ description: "" }) as any).config;
		expect(config.description).toBe("Client for Memory MCP Client");
	});
});
