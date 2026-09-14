import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Logger } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { EnvUtils } from "../../../../http/providers/agent-loader/env-utils";

/**
 * Leftover: `allMissing || (varName ? [varName] : [])` — empty array is truthy
 * so || keeps [] and ignores varName (unlike ??).
 */
describe("EnvUtils allMissing || varName leftover edges", () => {
	const utils = new EnvUtils(new Logger("EnvUtilsOrTest"), true);

	it("empty allMissing array wins over varName via ||", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-or-empty-"));
		const message = utils.generateEnvErrorMessage(root, "API_KEY", []);
		expect(message).toContain("MISSING ENVIRONMENT VARIABLE\n");
		expect(message).not.toContain("Required:");
		expect(message).not.toContain("API_KEY");
	});

	it("omitted allMissing with empty varName yields no Required list", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-or-blank-"));
		const message = utils.generateEnvErrorMessage(root, "");
		expect(message).toContain("MISSING ENVIRONMENT VARIABLE\n");
		expect(message).not.toContain("Required:");
	});

	it("omitted allMissing with varName uses singular VARIABLE header", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-or-one-"));
		const message = utils.generateEnvErrorMessage(root, "API_KEY");
		expect(message).toContain("MISSING ENVIRONMENT VARIABLE\n");
		expect(message).not.toContain("VARIABLES");
		expect(message).toContain("Required: API_KEY");
	});

	it("two allMissing names use plural VARIABLES header", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-or-two-"));
		const message = utils.generateEnvErrorMessage(root, "IGNORED", ["A", "B"]);
		expect(message).toContain("MISSING ENVIRONMENT VARIABLES");
		expect(message).toContain("Required: A, B");
	});
});
