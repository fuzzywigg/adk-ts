import { afterEach, describe, expect, it } from "vitest";
import { McpGeneric, McpMemory } from "../../../tools/mcp/servers";

/**
 * Fifteenth leftover: createMcpConfig `description || \`Client for ${name}\``
 * and McpGeneric `name || \`${package} Client\`` — thirteenth pins falsy
 * coalesce and whitespace keep; debug `"0"` keep. Description/name `"0"` /
 * `"false"` are truthy and kept.
 */
describe("mcp servers description string-zero-false keep fifteenth leftover", () => {
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
	])('description "%s" is kept (not Client for …)', (description) => {
		const config = (McpMemory({ description: description as any }) as any)
			.config;
		expect(config.description).toBe(description);
	});

	it.each([
		"0",
		"false",
	])('McpGeneric name "%s" is kept (not package Client)', (name) => {
		const config = (McpGeneric("@example/pkg", {}, name as any) as any).config;
		expect(config.name).toBe(name);
	});

	it("empty description still coalesces (thirteenth control)", () => {
		const config = (McpMemory({ description: "" }) as any).config;
		expect(config.description).toBe("Client for Memory MCP Client");
	});

	it('debug "false" is truthy and kept (companion to thirteenth "0")', () => {
		expect((McpMemory({ debug: "false" as any }) as any).config.debug).toBe(
			"false",
		);
	});
});
