import { afterEach, describe, expect, it } from "vitest";
import { McpGeneric } from "../../../tools/mcp/servers";

/**
 * Twentieth leftover: McpGeneric `name || \`${packageName} Client\`` —
 * string "0"/"false" kept (thirteenth only pinned falsy → fallback).
 */
describe("mcp servers generic name string-zero/false keep twentieth leftover", () => {
	const originalPath = process.env.PATH;

	afterEach(() => {
		if (originalPath === undefined) {
			delete process.env.PATH;
		} else {
			process.env.PATH = originalPath;
		}
	});

	it.each(["0", "false"] as const)("name: %j kept via ||", (name) => {
		const config = (McpGeneric("@example/pkg", {}, name) as any).config;
		expect(config.name).toBe(name);
	});

	it('"" still falls back to "<package> Client" (control)', () => {
		const config = (McpGeneric("@example/pkg", {}, "") as any).config;
		expect(config.name).toBe("@example/pkg Client");
	});

	it("whitespace still kept (thirteenth control)", () => {
		expect((McpGeneric("@example/pkg", {}, " ") as any).config.name).toBe(" ");
	});
});
