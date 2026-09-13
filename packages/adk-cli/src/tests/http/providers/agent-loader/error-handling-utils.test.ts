import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Logger } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
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

	it("classifies optional-only missing env vars", () => {
		const utils = new ErrorHandlingUtils(new Logger("test"));
		const schema = z.object({
			PORT: z.string(),
			ADK_DEBUG: z.string(),
		});

		try {
			schema.parse({});
		} catch (error) {
			const result = utils.isMissingEnvError(error);
			expect(result.isMissing).toBe(true);
			expect(result.hasOnlyOptionalMissing).toBe(true);
			expect(result.optionalMissing).toEqual(
				expect.arrayContaining(["PORT", "ADK_DEBUG"]),
			);
		}
	});

	it("formats categorized runtime errors and optional debug stacks", () => {
		const utils = new ErrorHandlingUtils(new Logger("test"));
		const previous = process.env.ADK_DEBUG_NEST;
		delete process.env.ADK_DEBUG_NEST;

		expect(
			utils.formatUserError(new Error("Failed to load agent: boom")),
		).toContain("Agent Loading Error");
		expect(utils.formatUserError(new Error("agent not found"))).toContain(
			"Agent Not Found",
		);
		expect(
			utils.formatUserError(new Error("Failed executing agent runtime step")),
		).toContain("Agent Runtime Error");

		const syntax = new SyntaxError("Unexpected token");
		expect(utils.formatUserError(syntax)).toContain("Syntax Error");
		expect(utils.formatUserError(syntax)).not.toContain("Stack trace:");

		process.env.ADK_DEBUG_NEST = "1";
		const withStack = utils.formatUserError(new Error("Boom"));
		expect(withStack).toContain("Stack trace:");

		if (previous === undefined) delete process.env.ADK_DEBUG_NEST;
		else process.env.ADK_DEBUG_NEST = previous;
	});

	it("handleImportError warns for optional env, throws for required, and falls back to dynamic import", async () => {
		const warn = vi.fn();
		const error = vi.fn();
		const utils = new ErrorHandlingUtils({
			warn,
			error,
		} as unknown as Logger);

		const optionalSchema = z.object({ PORT: z.string() });
		let optionalError: unknown;
		try {
			optionalSchema.parse({});
		} catch (err) {
			optionalError = err;
		}

		const outFile = join(
			mkdtempSync(join(tmpdir(), "adk-cli-import-")),
			"agent.mjs",
		);
		writeFileSync(outFile, "export const agent = { name: 'demo' };\n");

		const loaded = await utils.handleImportError(
			optionalError,
			outFile,
			"/tmp",
		);
		expect(warn).toHaveBeenCalled();
		expect(loaded).toMatchObject({ agent: { name: "demo" } });

		const requiredSchema = z.object({ API_KEY: z.string() });
		let requiredError: unknown;
		try {
			requiredSchema.parse({});
		} catch (err) {
			requiredError = err;
		}
		await expect(
			utils.handleImportError(requiredError, outFile, "/tmp"),
		).rejects.toThrow(/Missing required environment variable/);
		expect(error).toHaveBeenCalled();

		await expect(
			utils.handleImportError(
				new Error("unrelated"),
				join(tmpdir(), "missing-agent.mjs"),
				"/tmp",
			),
		).rejects.toThrow(/Failed to load agent/);
	});
});
