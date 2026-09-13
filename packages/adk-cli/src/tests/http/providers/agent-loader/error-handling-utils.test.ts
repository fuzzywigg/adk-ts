import { Logger } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DEFAULT_APP_NAME, USER_ID_PREFIX } from "../../../../common/constants";
import { ErrorHandlingUtils } from "../../../../http/providers/agent-loader/error-handling-utils";

describe("constants", () => {
	it("exposes stable session defaults", () => {
		expect(USER_ID_PREFIX).toBe("user_");
		expect(DEFAULT_APP_NAME).toBe("adk-server");
	});
});

describe("ErrorHandlingUtils", () => {
	it("classifies missing required and optional env vars", () => {
		const utils = new ErrorHandlingUtils(new Logger("test"));
		const schema = z.object({
			API_KEY: z.string(),
			PORT: z.string(),
		});

		try {
			schema.parse({});
		} catch (error) {
			const result = utils.isMissingEnvError(error);
			expect(result.isMissing).toBe(true);
			expect(result.requiredMissing).toContain("API_KEY");
			expect(result.optionalMissing).toContain("PORT");
			expect(result.hasOnlyOptionalMissing).toBe(false);
		}
	});

	it("formats zod and runtime errors for users", () => {
		const utils = new ErrorHandlingUtils(new Logger("test"));
		const schema = z.object({ name: z.string() });

		try {
			schema.parse({});
		} catch (error) {
			const formatted = utils.formatUserError(error);
			expect(formatted).toContain("Validation Error");
			expect(formatted).toContain("name");
		}

		const runtime = utils.formatUserError(
			new Error("Cannot find module 'missing-pkg'"),
		);
		expect(runtime).toContain("Module Not Found");
		expect(runtime).toContain("npm install missing-pkg");
	});

	it("returns non-missing for unrelated errors", () => {
		const utils = new ErrorHandlingUtils(new Logger("test"));
		expect(utils.isMissingEnvError(new Error("boom"))).toEqual({
			isMissing: false,
		});
		expect(utils.formatUserError("raw")).toContain("Unknown Error");
	});
});
