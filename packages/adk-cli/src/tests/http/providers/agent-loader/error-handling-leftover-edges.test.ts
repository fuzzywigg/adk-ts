import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ErrorHandlingUtils } from "../../../../http/providers/agent-loader/error-handling-utils";

describe("ErrorHandlingUtils leftover edges (TOKENMAXX adk-cli)", () => {
	const originalDebug = process.env.ADK_DEBUG_NEST;

	afterEach(() => {
		if (originalDebug === undefined) delete process.env.ADK_DEBUG_NEST;
		else process.env.ADK_DEBUG_NEST = originalDebug;
	});

	it("returns non-missing for Zod errors without invalid_type issues", () => {
		const utils = new ErrorHandlingUtils({} as Logger);
		const schema = z.object({ n: z.string().min(8) });
		const parsed = schema.safeParse({ n: "x" });
		expect(utils.isMissingEnvError(parsed.error)).toEqual({ isMissing: false });
	});

	it("formats Zod issues with empty paths as (root)", () => {
		const utils = new ErrorHandlingUtils({} as Logger);
		const formatted = utils.formatUserError(z.string().safeParse(1).error);
		expect(formatted).toContain("(root)");
	});

	it("formats TypeError, unquoted module errors, and empty Error.name", () => {
		const utils = new ErrorHandlingUtils({} as Logger);
		expect(
			utils.formatUserError(
				new TypeError("Cannot read properties of undefined"),
			),
		).toContain("Type Error");

		expect(
			utils.formatUserError(new Error("Cannot find module missing-no-quotes")),
		).toContain("Check your imports and package.json");

		const nameless = new Error("generic");
		nameless.name = "";
		expect(utils.formatUserError(nameless)).toContain("❌ Error");
	});

	it("pluralizes missing required environment variables", async () => {
		const error = vi.fn();
		const utils = new ErrorHandlingUtils({
			error,
			warn: vi.fn(),
		} as unknown as Logger);
		const schema = z.object({
			API_KEY: z.string(),
			SECRET: z.string(),
		});
		let requiredError: unknown;
		try {
			schema.parse({});
		} catch (err) {
			requiredError = err;
		}

		await expect(
			utils.handleImportError(requiredError, "/tmp/none.mjs", "/tmp"),
		).rejects.toThrow(
			/Missing required environment variables: API_KEY, SECRET/,
		);
		expect(error).toHaveBeenCalled();
	});

	it("stringifies non-Error fallback import failures", async () => {
		const utils = new ErrorHandlingUtils({
			error: vi.fn(),
			warn: vi.fn(),
		} as unknown as Logger);
		const outFile = join(
			mkdtempSync(join(tmpdir(), "adk-cli-import-leftover-")),
			"broken.mjs",
		);
		writeFileSync(outFile, "throw 'string-throw';\n");

		await expect(
			utils.handleImportError(new Error("unrelated"), outFile, "/tmp"),
		).rejects.toThrow(/Failed to load agent/);
	});
});
