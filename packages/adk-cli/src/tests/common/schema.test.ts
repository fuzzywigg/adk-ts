import { describe, expect, it } from "vitest";
import { envSchema, environmentEnum } from "../../common/schema";

describe("environmentEnum", () => {
	it("accepts development and production", () => {
		expect(environmentEnum.parse("development")).toBe("development");
		expect(environmentEnum.parse("production")).toBe("production");
		expect(() => environmentEnum.parse("staging")).toThrow();
	});
});

describe("envSchema", () => {
	it("applies defaults", () => {
		const parsed = envSchema.parse({});
		expect(parsed.ADK_DEBUG).toBe(false);
		expect(parsed.NODE_ENV).toBe("development");
		expect(parsed.ADK_HTTP_BODY_LIMIT).toBe("25mb");
		expect(parsed.ADK_VERBOSE).toBe(false);
	});

	it("parses boolean-like debug and verbose flags", () => {
		expect(
			envSchema.parse({
				ADK_DEBUG: "true",
				ADK_VERBOSE: "1",
				NODE_ENV: "production",
				ADK_HTTP_BODY_LIMIT: "10mb",
			}),
		).toEqual({
			ADK_DEBUG: true,
			ADK_VERBOSE: true,
			NODE_ENV: "production",
			ADK_HTTP_BODY_LIMIT: "10mb",
		});

		expect(
			envSchema.parse({
				ADK_DEBUG: "false",
				ADK_VERBOSE: "false",
			}),
		).toMatchObject({
			ADK_DEBUG: false,
			ADK_VERBOSE: false,
		});
	});
});
