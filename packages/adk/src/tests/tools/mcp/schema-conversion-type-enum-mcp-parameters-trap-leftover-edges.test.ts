import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { mcpSchemaToParameters } from "../../../tools/mcp/schema-conversion";

/**
 * Leftover: mcpSchemaToParameters forwards inputSchema/parameters through
 * normalizeJsonSchema, so Type-enum traps (additionalProperties, exclusive
 * bounds, boolean title) surface at the MCP adapter boundary.
 */
describe("schema-conversion Type-enum mcpSchemaToParameters trap leftover edges", () => {
	it("inputSchema Type.OBJECT preserves additionalProperties", () => {
		expect(
			mcpSchemaToParameters({
				name: "t",
				inputSchema: {
					type: Type.OBJECT,
					properties: { q: { type: Type.STRING } },
					additionalProperties: true,
					minProperties: 1,
				},
			} as any),
		).toEqual({
			type: Type.OBJECT,
			properties: { q: { type: Type.STRING } },
			additionalProperties: true,
			minProperties: 1,
		});
	});

	it('inputSchema lowercase "object" strips additionalProperties', () => {
		expect(
			mcpSchemaToParameters({
				name: "t",
				inputSchema: {
					type: "object",
					properties: { q: { type: "string" } },
					additionalProperties: true,
					minProperties: 1,
				},
			} as any),
		).toEqual({
			type: Type.OBJECT,
			properties: { q: { type: Type.STRING } },
		});
	});

	it("inputSchema Type.ARRAY preserves exclusive bounds on items", () => {
		expect(
			mcpSchemaToParameters({
				name: "t",
				inputSchema: {
					type: Type.ARRAY,
					items: { type: Type.NUMBER, exclusiveMinimum: 0 },
					uniqueItems: true,
				},
			} as any),
		).toEqual({
			type: Type.ARRAY,
			items: { type: Type.NUMBER, exclusiveMinimum: 0 },
			uniqueItems: true,
		});
	});

	it("parameters Type.BOOLEAN fallback preserves title", () => {
		expect(
			mcpSchemaToParameters({
				name: "t",
				parameters: { type: Type.BOOLEAN, title: "x" },
			} as any),
		).toEqual({ type: Type.BOOLEAN, title: "x" });
	});

	it('parameters lowercase "boolean" drops title', () => {
		expect(
			mcpSchemaToParameters({
				name: "t",
				parameters: { type: "boolean", title: "x" },
			} as any),
		).toEqual({ type: Type.BOOLEAN });
	});

	it("prefers inputSchema over parameters when both present", () => {
		expect(
			mcpSchemaToParameters({
				name: "t",
				inputSchema: {
					type: Type.OBJECT,
					additionalProperties: true,
				},
				parameters: {
					type: "object",
					properties: { ignored: { type: "string" } },
				},
			} as any),
		).toEqual({
			type: Type.OBJECT,
			additionalProperties: true,
		});
	});

	it("missing schema still returns empty object parameters", () => {
		expect(mcpSchemaToParameters({ name: "empty" } as any)).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});
});
