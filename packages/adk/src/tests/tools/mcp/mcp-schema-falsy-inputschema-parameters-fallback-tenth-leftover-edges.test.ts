import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { mcpSchemaToParameters } from "../../../tools/mcp/schema-conversion";

/**
 * Tenth leftover: mcpSchemaToParameters prefers truthy inputSchema over
 * parameters. Falsy inputSchema ("" / 0 / false / null) falls through to
 * parameters; empty object {} is truthy and wins (inferred OBJECT).
 */
describe("mcp-schema falsy inputSchema parameters fallback tenth leftover edges", () => {
	const parameters = {
		type: "object",
		properties: { q: { type: "string" } },
	};

	it.each([
		{ label: "undefined", inputSchema: undefined },
		{ label: "null", inputSchema: null },
		{ label: "empty string", inputSchema: "" },
		{ label: "0", inputSchema: 0 },
		{ label: "false", inputSchema: false },
	])("falsy inputSchema ($label) falls through to parameters", ({
		inputSchema,
	}) => {
		expect(
			mcpSchemaToParameters({
				name: "t",
				inputSchema: inputSchema as any,
				parameters,
			} as any),
		).toEqual({
			type: Type.OBJECT,
			properties: { q: { type: Type.STRING } },
		});
	});

	it("empty-object inputSchema is truthy and wins over parameters", () => {
		expect(
			mcpSchemaToParameters({
				name: "t",
				inputSchema: {},
				parameters,
			} as any),
		).toEqual({ type: Type.OBJECT });
	});

	it("typed inputSchema still wins (control)", () => {
		expect(
			mcpSchemaToParameters({
				name: "t",
				inputSchema: {
					type: "object",
					properties: { z: { type: "number" } },
				},
				parameters,
			} as any),
		).toEqual({
			type: Type.OBJECT,
			properties: { z: { type: "number" } },
		});
	});
});
