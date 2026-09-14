import { describe, expect, it } from "vitest";
import { RunConfig } from "../../agents/run-config";

describe("RunConfig boolean flags || false fifth leftover", () => {
	it.each([
		{ label: "empty-string", value: "" as const },
		{ label: "null", value: null },
		{ label: "0", value: 0 as const },
		{ label: "false", value: false as const },
		{ label: "NaN", value: Number.NaN },
	])("$label saveInputBlobsAsArtifacts / supportCFC coalesce to false via ||", ({
		value,
	}) => {
		const config = new RunConfig({
			saveInputBlobsAsArtifacts: value as any,
			supportCFC: value as any,
		});
		expect(config.saveInputBlobsAsArtifacts).toBe(false);
		expect(config.supportCFC).toBe(false);
	});

	it("explicit true flags are preserved", () => {
		const config = new RunConfig({
			saveInputBlobsAsArtifacts: true,
			supportCFC: true,
		});
		expect(config.saveInputBlobsAsArtifacts).toBe(true);
		expect(config.supportCFC).toBe(true);
	});

	it("truthy non-boolean flags are preserved as-is", () => {
		const config = new RunConfig({
			saveInputBlobsAsArtifacts: 1 as any,
			supportCFC: "yes" as any,
		});
		expect(config.saveInputBlobsAsArtifacts).toBe(1);
		expect(config.supportCFC).toBe("yes");
	});
});
