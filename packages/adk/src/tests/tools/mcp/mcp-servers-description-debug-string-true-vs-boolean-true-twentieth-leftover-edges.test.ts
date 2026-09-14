import { afterEach, describe, expect, it } from "vitest";
import { McpMemory } from "../../../tools/mcp/servers";

/**
 * Twentieth leftover: createMcpConfig `description ||` / `debug || false` —
 * string `"true"` kept (nineteenth pinned `"false"` / `"0"`). Boolean `true`
 * debug stays boolean; string `"true"` stays string (type asymmetry).
 */
describe("mcp servers description/debug string-true vs boolean-true twentieth leftover", () => {
	const originalPath = process.env.PATH;

	afterEach(() => {
		if (originalPath === undefined) {
			delete process.env.PATH;
		} else {
			process.env.PATH = originalPath;
		}
	});

	it('description: "true" kept via || (unlike "" → Client for …)', () => {
		const config = (McpMemory({ description: "true" }) as any).config;
		expect(config.description).toBe("true");
	});

	it("description: boolean true kept via || (truthy non-string)", () => {
		const config = (McpMemory({ description: true as any }) as any).config;
		expect(config.description).toBe(true);
	});

	it('debug: "true" kept as string via ||', () => {
		expect((McpMemory({ debug: "true" as any }) as any).config.debug).toBe(
			"true",
		);
	});

	it("debug: boolean true kept as boolean (asymmetry vs string true)", () => {
		expect((McpMemory({ debug: true }) as any).config.debug).toBe(true);
	});

	it("falsy debug still coalesces to false (thirteenth/nineteenth control)", () => {
		expect((McpMemory({ debug: false }) as any).config.debug).toBe(false);
	});
});
