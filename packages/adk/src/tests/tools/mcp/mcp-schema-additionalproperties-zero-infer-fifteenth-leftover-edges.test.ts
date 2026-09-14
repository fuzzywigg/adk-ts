import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { normalizeJsonSchema } from "../../../tools/mcp/schema-conversion";

/**
 * Fifteenth leftover: determineSchemaType uses
 * `additionalProperties !== undefined` — falsy 0/false/"" still infer OBJECT.
 */
describe("mcp schema additionalProperties zero infer fifteenth leftover", () => {
	it.each([
		{ label: "0", additionalProperties: 0 },
		{ label: "false", additionalProperties: false },
		{ label: '""', additionalProperties: "" },
	] as const)("additionalProperties: $label infers Type.OBJECT", ({
		additionalProperties,
	}) => {
		expect(normalizeJsonSchema({ additionalProperties } as any)).toEqual(
			expect.objectContaining({
				type: Type.OBJECT,
				additionalProperties,
			}),
		);
	});

	it("bare {} still infers Type.OBJECT without inventing properties", () => {
		expect(normalizeJsonSchema({})).toEqual({
			type: Type.OBJECT,
		});
	});
});
