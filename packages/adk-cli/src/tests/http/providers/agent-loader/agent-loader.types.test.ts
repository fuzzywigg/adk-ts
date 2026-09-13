import { describe, expect, it } from "vitest";
import { TsConfigSchema } from "../../../../http/providers/agent-loader.types";

describe("TsConfigSchema", () => {
	it("accepts empty objects and optional compilerOptions", () => {
		expect(TsConfigSchema.safeParse({}).success).toBe(true);
		expect(
			TsConfigSchema.safeParse({
				compilerOptions: { baseUrl: "." },
			}).success,
		).toBe(true);
		expect(
			TsConfigSchema.safeParse({
				compilerOptions: {
					baseUrl: "./src",
					paths: { "@/*": ["*"], "@lib/*": ["lib/*"] },
				},
			}).success,
		).toBe(true);
	});

	it("rejects invalid paths shapes", () => {
		expect(
			TsConfigSchema.safeParse({
				compilerOptions: { paths: { "@/*": "not-an-array" } },
			}).success,
		).toBe(false);
		expect(
			TsConfigSchema.safeParse({
				compilerOptions: { baseUrl: 12 },
			}).success,
		).toBe(false);
	});
});
