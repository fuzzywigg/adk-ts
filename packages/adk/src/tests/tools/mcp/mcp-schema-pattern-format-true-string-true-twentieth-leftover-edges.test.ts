import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import type { BaseTool } from "../../../tools/base/base-tool";
import {
	adkToMcpToolType,
	normalizeJsonSchema,
} from "../../../tools/mcp/schema-conversion";

/**
 * Twentieth leftover: nineteenth pins pattern/format `"0"`/`"false"` keep.
 * Boolean `true` / `"true"` kept via truthy `if`; title/description likewise.
 * adkToMcp `description || ""` keeps true/"true"; `-0` → "".
 */
describe("mcp schema pattern/format/description true twentieth leftover", () => {
	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
	])("typed string pattern $label kept via truthy if", ({ value }) => {
		expect(
			normalizeJsonSchema({
				type: "string",
				pattern: value as any,
			}),
		).toEqual({
			type: Type.STRING,
			pattern: value,
		});
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
	])("typed string format $label kept via truthy if", ({ value }) => {
		expect(
			normalizeJsonSchema({
				type: "string",
				format: value as any,
			}),
		).toEqual({
			type: Type.STRING,
			format: value,
		});
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
	])("typed string title $label kept", ({ value }) => {
		expect(
			normalizeJsonSchema({
				type: "string",
				title: value as any,
			}),
		).toEqual({
			type: Type.STRING,
			title: value,
		});
	});

	it("pattern SameValueZero -0 is falsy and dropped", () => {
		expect(
			normalizeJsonSchema({
				type: "string",
				pattern: -0 as any,
				format: "uuid",
			}),
		).toEqual({
			type: Type.STRING,
			format: "uuid",
		});
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
	])("adkToMcp description $label kept via ||", ({ value }) => {
		const tool = {
			name: "t",
			description: value,
			getDeclaration: () => ({ name: "t", description: "d" }),
		} as BaseTool;
		expect(adkToMcpToolType(tool).description).toBe(value);
	});

	it("adkToMcp description SameValueZero -0 becomes empty string", () => {
		const tool = {
			name: "t",
			description: -0 as any,
			getDeclaration: () => ({ name: "t", description: "d" }),
		} as BaseTool;
		expect(adkToMcpToolType(tool).description).toBe("");
	});
});
