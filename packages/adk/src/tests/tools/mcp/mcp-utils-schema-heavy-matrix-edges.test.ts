import { Type } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import type { BaseTool } from "../../../tools/base/base-tool";
import {
	adkToMcpToolType,
	declarationToJsonSchema,
	jsonSchemaToDeclaration,
	normalizeJsonSchema,
} from "../../../tools/mcp/schema-conversion";
import { retryOnClosedResource, withRetry } from "../../../tools/mcp/utils";

describe("MCP schema-conversion heavy matrix leftover edges", () => {
	it("declarationToJsonSchema returns {} without parameters", () => {
		expect(declarationToJsonSchema({ name: "n", description: "d" })).toEqual(
			{},
		);
	});

	it("declarationToJsonSchema prefers properties when present", () => {
		expect(
			declarationToJsonSchema({
				name: "n",
				description: "d",
				parameters: {
					type: Type.OBJECT,
					properties: { q: { type: Type.STRING } },
					required: ["q"],
				},
			}),
		).toEqual({ q: { type: Type.STRING } });
	});

	it("declarationToJsonSchema returns whole parameters when properties absent", () => {
		expect(
			declarationToJsonSchema({
				name: "n",
				description: "d",
				parameters: { type: Type.OBJECT } as any,
			}),
		).toEqual({ type: Type.OBJECT });
	});

	it("jsonSchemaToDeclaration wraps bare maps and preserves typed schemas", () => {
		expect(
			jsonSchemaToDeclaration("search", "find", {
				query: { type: "string" },
			}).parameters,
		).toEqual({
			type: Type.OBJECT,
			properties: { query: { type: "string" } },
		});
		expect(
			jsonSchemaToDeclaration("typed", "d", {
				type: "object",
				properties: { a: { type: "number" } },
			}).parameters,
		).toEqual({
			type: "object",
			properties: { a: { type: "number" } },
		});
		expect(jsonSchemaToDeclaration("empty", "d", undefined).parameters).toEqual(
			{
				type: Type.OBJECT,
				properties: {},
			},
		);
	});

	it("normalizeJsonSchema handles null and boolean/null types", () => {
		expect(normalizeJsonSchema(null as any)).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
		expect(normalizeJsonSchema({ type: "boolean" })).toEqual({
			type: Type.BOOLEAN,
		});
		expect(normalizeJsonSchema({ type: "null" })).toEqual({
			type: Type.NULL,
		});
	});

	it("normalizeJsonSchema infers object from properties/required", () => {
		const normalized = normalizeJsonSchema({
			properties: { name: { type: "string" } },
			required: ["name"],
		});
		expect(normalized.type).toBe(Type.OBJECT);
		expect((normalized as any).required).toEqual(["name"]);
	});

	it("normalizeJsonSchema infers array from items", () => {
		expect(normalizeJsonSchema({ items: { type: "number" } })).toEqual({
			type: Type.ARRAY,
			items: { type: "number" },
		});
	});

	it("normalizeJsonSchema infers string from pattern/minLength", () => {
		expect(normalizeJsonSchema({ pattern: "^a+$", minLength: 1 })).toEqual({
			type: Type.STRING,
			pattern: "^a+$",
			minLength: 1,
		});
	});

	it("normalizeJsonSchema infers types from enum values", () => {
		expect(normalizeJsonSchema({ enum: [] }).type).toBe(Type.STRING);
		expect(normalizeJsonSchema({ enum: ["a", "b"] }).type).toBe(Type.STRING);
		expect(normalizeJsonSchema({ enum: [1, 2] }).type).toBe(Type.NUMBER);
		expect(normalizeJsonSchema({ enum: [true, false] }).type).toBe(
			Type.BOOLEAN,
		);
	});

	it("normalizeJsonSchema preserves number/integer schemas as lowercase type strings", () => {
		expect(normalizeJsonSchema({ type: "number", minimum: 0 })).toMatchObject({
			type: "number",
			minimum: 0,
		});
		expect(normalizeJsonSchema({ type: "integer", maximum: 5 })).toMatchObject({
			type: "integer",
			maximum: 5,
		});
	});

	it("adkToMcpToolType maps tool declaration into MCP inputSchema", () => {
		const tool = {
			name: "echo",
			description: "Echoes",
			getDeclaration: () => ({
				name: "echo",
				description: "Echoes",
				parameters: {
					type: Type.OBJECT,
					properties: { text: { type: Type.STRING } },
				},
			}),
		} as unknown as BaseTool;
		expect(adkToMcpToolType(tool)).toEqual({
			name: "echo",
			description: "Echoes",
			inputSchema: {
				type: "object",
				properties: { text: { type: Type.STRING } },
			},
		});
	});

	it("adkToMcpToolType uses empty description fallback", () => {
		const tool = {
			name: "bare",
			description: "",
			getDeclaration: () => ({ name: "bare", description: "" }),
		} as unknown as BaseTool;
		expect(adkToMcpToolType(tool).description).toBe("");
		expect(adkToMcpToolType(tool).inputSchema).toEqual({
			type: "object",
			properties: {},
		});
	});
});

describe("MCP utils heavy matrix leftover edges", () => {
	it("withRetry returns on first success without reinit", async () => {
		const instance = { n: 1 };
		const reinit = vi.fn(async () => undefined);
		const fn = vi.fn(async function (this: typeof instance) {
			return this.n;
		});
		await expect(withRetry(fn, instance, reinit)()).resolves.toBe(1);
		expect(reinit).not.toHaveBeenCalled();
	});

	it("retries closed/ECONNRESET/socket hang up messages", async () => {
		const instance = {};
		const reinit = vi.fn(async () => undefined);
		for (const message of ["closed", "ECONNRESET", "socket hang up"]) {
			let attempts = 0;
			const fn = vi.fn(async () => {
				attempts++;
				if (attempts === 1) throw new Error(message);
				return "ok";
			});
			await expect(withRetry(fn, instance, reinit, 1)()).resolves.toBe("ok");
		}
		expect(reinit).toHaveBeenCalledTimes(3);
	});

	it("does not retry non-closed errors", async () => {
		const reinit = vi.fn(async () => undefined);
		const fn = vi.fn(async () => {
			throw new Error("permission denied");
		});
		await expect(withRetry(fn, {}, reinit, 3)()).rejects.toThrow(
			"permission denied",
		);
		expect(reinit).not.toHaveBeenCalled();
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("wraps reinit failures", async () => {
		const reinit = vi.fn(async () => {
			throw new Error("reinit boom");
		});
		const fn = vi.fn(async () => {
			throw new Error("connection closed");
		});
		await expect(withRetry(fn, {}, reinit, 1)()).rejects.toThrow(
			"Failed to reinitialize resources",
		);
	});

	it("exhausts retries and rethrows closed error", async () => {
		const reinit = vi.fn(async () => undefined);
		const fn = vi.fn(async () => {
			throw new Error("closed");
		});
		await expect(withRetry(fn, {}, reinit, 2)()).rejects.toThrow("closed");
		expect(fn).toHaveBeenCalledTimes(3);
		expect(reinit).toHaveBeenCalledTimes(2);
	});

	it("retryOnClosedResource decorates prototype methods", async () => {
		const reinit = vi.fn(async () => undefined);
		let attempts = 0;
		class Sample {
			async work(): Promise<string> {
				attempts++;
				if (attempts === 1) throw new Error("closed");
				return "done";
			}
		}
		const descriptor = Object.getOwnPropertyDescriptor(
			Sample.prototype,
			"work",
		)!;
		retryOnClosedResource(() => reinit(), 1)(
			Sample.prototype,
			"work",
			descriptor,
		);
		Object.defineProperty(Sample.prototype, "work", descriptor);
		await expect(new Sample().work()).resolves.toBe("done");
		expect(reinit).toHaveBeenCalledTimes(1);
	});

	it("withRetry forwards arguments to the wrapped function", async () => {
		const fn = vi.fn(async (a: number, b: string) => `${a}-${b}`);
		const wrapped = withRetry(fn, {}, async () => undefined);
		await expect(wrapped(1, "x")).resolves.toBe("1-x");
		expect(fn).toHaveBeenCalledWith(1, "x");
	});
});
