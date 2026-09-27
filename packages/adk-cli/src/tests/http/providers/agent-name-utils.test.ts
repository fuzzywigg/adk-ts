import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	extractAgentNameFromContent,
	extractAgentNameFromFile,
} from "../../../http/providers/agent-name-utils";

describe("extractAgentNameFromContent", () => {
	it("extracts double-quoted names with flexible spacing", () => {
		expect(
			extractAgentNameFromContent(
				`export const agent = { name: "travel_bot" };`,
			),
		).toBe("travel_bot");
		expect(extractAgentNameFromContent(`name:"compact"`)).toBe("compact");
		expect(extractAgentNameFromContent(`name  :   "spaced"`)).toBe("spaced");
	});

	it("extracts single-quoted names", () => {
		expect(
			extractAgentNameFromContent(`export const agent = { name: 'support' };`),
		).toBe("support");
	});

	it("returns null for empty quoted names (falsy capture)", () => {
		expect(extractAgentNameFromContent(`name: ""`)).toBeNull();
		expect(extractAgentNameFromContent(`name: ''`)).toBeNull();
	});

	it("returns null when no quoted name property is present", () => {
		expect(
			extractAgentNameFromContent("export const agent = { runAsync() {} };"),
		).toBeNull();
		expect(extractAgentNameFromContent("name: unquoted")).toBeNull();
		expect(extractAgentNameFromContent("")).toBeNull();
	});

	it("keeps falsy-looking but non-empty string names", () => {
		expect(extractAgentNameFromContent(`name: "0"`)).toBe("0");
		expect(extractAgentNameFromContent(`name: "false"`)).toBe("false");
	});

	it("uses the first name match in the file", () => {
		expect(
			extractAgentNameFromContent(
				`const a = { name: "first" }; const b = { name: "second" };`,
			),
		).toBe("first");
	});
});

describe("extractAgentNameFromFile", () => {
	it("reads a file and extracts the agent name", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-agent-name-"));
		const filePath = join(root, "agent.ts");
		writeFileSync(
			filePath,
			`export const agent = { name: "from_disk", runAsync() {} };\n`,
		);
		expect(extractAgentNameFromFile(filePath)).toBe("from_disk");
	});

	it("returns null when the file cannot be read", () => {
		expect(
			extractAgentNameFromFile(
				join(tmpdir(), "adk-cli-missing-agent-name-file.ts"),
			),
		).toBeNull();
	});

	it("returns null when the file has no usable quoted name", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-agent-name-empty-"));
		const filePath = join(root, "agent.ts");
		writeFileSync(filePath, "export const agent = { runAsync() {} };\n");
		expect(extractAgentNameFromFile(filePath)).toBeNull();
	});
});
