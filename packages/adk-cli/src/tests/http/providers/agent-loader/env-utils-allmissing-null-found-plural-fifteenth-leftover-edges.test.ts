import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Logger } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { EnvUtils } from "../../../../http/providers/agent-loader/env-utils";

/**
 * Fifteenth leftover: `allMissing || (varName ? …)` — `null` is falsy so
 * falls through to varName (unlike truthy `[]` which wins). Found path + 2+
 * missing uses plural "Add missing variables".
 */
describe("EnvUtils allMissing null / Found plural fifteenth leftover", () => {
	const utils = new EnvUtils(new Logger("EnvUtilsNullTest"), true);

	it("allMissing: null falls through to varName via || (not ??)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-null-all-"));
		const message = utils.generateEnvErrorMessage(
			root,
			"API_KEY",
			null as unknown as string[],
		);
		expect(message).toContain("Required: API_KEY");
		expect(message).toContain("MISSING ENVIRONMENT VARIABLE\n");
		expect(message).not.toContain("VARIABLES");
	});

	it("Found path + 2+ missing → plural Add missing variables", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-found-plural-"));
		writeFileSync(join(root, ".env"), "X=1\n");
		const message = utils.generateEnvErrorMessage(root, "IGNORED", ["A", "B"]);
		expect(message).toContain("Found: .env");
		expect(message).toContain("Add missing variables to one of these files");
		expect(message).toContain("MISSING ENVIRONMENT VARIABLES");
		expect(message).toContain("Required: A, B");
		expect(message).not.toContain("Create a .env file");
		expect(message).not.toMatch(/Add missing variable[^s]/);
	});
});
