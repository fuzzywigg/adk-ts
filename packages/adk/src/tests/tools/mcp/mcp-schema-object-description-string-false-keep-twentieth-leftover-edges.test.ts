import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Twentieth leftover: normalizeObjectSchema `if (schema.description)` —
 * string "false"/"0" kept; empty string dropped (title "0" already thirteenth).
 */
describe("mcp schema object description string-false keep twentieth leftover", () => {
	it.each([
		"0",
		"false",
	] as const)("object description: %j kept via truthy if", (description) => {
		expect(
			normalizeJsonSchema({
				type: "object",
				properties: {},
				description,
			}),
		).toEqual({
			type: Type.OBJECT,
			properties: {},
			description,
		});
	});

	it("empty description still dropped (control)", () => {
		expect(
			normalizeJsonSchema({
				type: "object",
				properties: {},
				description: "",
			}),
		).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});

	it('title: "0" still kept (thirteenth control)', () => {
		expect(
			normalizeJsonSchema({
				type: "object",
				properties: {},
				title: "0",
			}),
		).toEqual({
			type: Type.OBJECT,
			properties: {},
			title: "0",
		});
	});
});
