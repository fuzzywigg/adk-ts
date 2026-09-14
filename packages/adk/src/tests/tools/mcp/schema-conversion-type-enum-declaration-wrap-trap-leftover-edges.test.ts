import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { jsonSchemaToDeclaration } from "../../../tools/mcp/schema-conversion";

/**
 * Leftover: jsonSchemaToDeclaration treats schemas with a string `type` as
 * already-typed (including Type.OBJECT === "OBJECT"). Non-string `type`
 * values fall through to the bare-map wrap path.
 */
describe("schema-conversion Type-enum declaration wrap trap leftover edges", () => {
	it("preserves Type.OBJECT schema as-is when type is a string enum value", () => {
		expect(
			jsonSchemaToDeclaration("n", "d", {
				type: Type.OBJECT,
				properties: { a: { type: Type.STRING } },
				additionalProperties: true,
			}).parameters,
		).toEqual({
			type: Type.OBJECT,
			properties: { a: { type: Type.STRING } },
			additionalProperties: true,
		});
	});

	it('preserves lowercase "object" schema without rewriting', () => {
		expect(
			jsonSchemaToDeclaration("n", "d", {
				type: "object",
				properties: { a: { type: "string" } },
			}).parameters,
		).toEqual({
			type: "object",
			properties: { a: { type: "string" } },
		});
	});

	it("wraps bare property maps that lack a string type", () => {
		expect(
			jsonSchemaToDeclaration("n", "d", {
				query: { type: "string" },
			}).parameters,
		).toEqual({
			type: Type.OBJECT,
			properties: { query: { type: "string" } },
		});
	});

	it("wraps when type is null (not a string)", () => {
		expect(
			jsonSchemaToDeclaration("n", "d", { type: null } as any).parameters,
		).toEqual({
			type: Type.OBJECT,
			properties: { type: null },
		});
	});

	it("wraps when type is a union array (not a string)", () => {
		expect(
			jsonSchemaToDeclaration("n", "d", {
				type: ["object", "null"],
			} as any).parameters,
		).toEqual({
			type: Type.OBJECT,
			properties: { type: ["object", "null"] },
		});
	});

	it("wraps when type is a number (not a string)", () => {
		expect(
			jsonSchemaToDeclaration("n", "d", { type: 123, a: 1 } as any).parameters,
		).toEqual({
			type: Type.OBJECT,
			properties: { type: 123, a: 1 },
		});
	});

	it("defaults undefined schema to empty object parameters", () => {
		expect(jsonSchemaToDeclaration("empty", "d", undefined).parameters).toEqual(
			{
				type: Type.OBJECT,
				properties: {},
			},
		);
	});

	it("wraps empty object {} as empty properties bag", () => {
		expect(jsonSchemaToDeclaration("empty_props", "d", {}).parameters).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});

	it("preserves Type.ARRAY schemas via string type gate", () => {
		expect(
			jsonSchemaToDeclaration("list", "d", {
				type: Type.ARRAY,
				items: { type: Type.NUMBER },
				uniqueItems: true,
			}).parameters,
		).toEqual({
			type: Type.ARRAY,
			items: { type: Type.NUMBER },
			uniqueItems: true,
		});
	});
});
