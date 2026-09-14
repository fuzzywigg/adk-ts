import { mkdtempSync, writeFileSync } from "node:fs";
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

	it("lists Found env files in priority order when present (not Create template)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-or-found-"));
		writeFileSync(join(root, ".env"), "X=1\n");
		writeFileSync(join(root, ".env.local"), "Y=1\n");
		writeFileSync(join(root, ".env.development"), "Z=1\n");
		const message = utils.generateEnvErrorMessage(root, "MISSING_ONE");
		expect(message).toContain("Found: .env.local, .env.development, .env");
		expect(message).toContain("Add missing variable to one of these files");
		expect(message).not.toContain("Create a .env file");
		expect(message).toContain("Required: MISSING_ONE");
	});

	it("singular Create template when no env files and one varName", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-or-create-"));
		const message = utils.generateEnvErrorMessage(root, "ONLY");
		expect(message).toContain("Create a .env file with:");
		expect(message).toContain("ONLY=your_value_here");
		expect(message).toContain("MISSING ENVIRONMENT VARIABLE\n");
		expect(message).not.toContain("VARIABLES");
		expect(message).not.toContain("Found:");
	});

	it("plural Create template lines when allMissing has 2+ and no env files", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-or-create-multi-"));
		const message = utils.generateEnvErrorMessage(root, "IGNORED", [
			"ONE",
			"TWO",
		]);
		expect(message).toContain("MISSING ENVIRONMENT VARIABLES");
		expect(message).toContain("Create a .env file with:");
		expect(message).toContain("ONE=your_value_here");
		expect(message).toContain("TWO=your_value_here");
		expect(message).not.toContain("Found:");
		expect(message).not.toContain("Add missing variable");
	});
});
