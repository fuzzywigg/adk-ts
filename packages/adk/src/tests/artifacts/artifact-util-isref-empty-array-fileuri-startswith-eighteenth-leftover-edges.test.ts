import { describe, expect, it } from "vitest";
import { isArtifactRef } from "../../artifacts/artifact-util";

/**
 * Eighteenth leftover: isArtifactRef is `fileUri && fileUri.startsWith(...)`.
 * Twelfth pins truthy non-strings `1` / `true` / `{}` → TypeError. Empty
 * array `[]` is likewise truthy and throws on `.startsWith`.
 */
describe("artifact-util isArtifactRef empty-array fileUri eighteenth leftover", () => {
	it("truthy [] throws TypeError on startsWith", () => {
		expect(() =>
			isArtifactRef({
				fileData: { fileUri: [] as any, mimeType: "text/plain" },
			}),
		).toThrow(TypeError);
	});

	it("truthy [0] also throws TypeError on startsWith", () => {
		expect(() =>
			isArtifactRef({
				fileData: { fileUri: [0] as any, mimeType: "text/plain" },
			}),
		).toThrow(TypeError);
	});

	it("boolean true still throws (twelfth control)", () => {
		expect(() =>
			isArtifactRef({
				fileData: { fileUri: true as any, mimeType: "text/plain" },
			}),
		).toThrow(TypeError);
	});

	it("falsy false still short-circuits to false (twelfth control)", () => {
		expect(
			isArtifactRef({
				fileData: { fileUri: false as any, mimeType: "text/plain" },
			}),
		).toBe(false);
	});
});
