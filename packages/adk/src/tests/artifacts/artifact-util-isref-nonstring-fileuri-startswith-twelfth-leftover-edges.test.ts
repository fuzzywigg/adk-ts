import { describe, expect, it } from "vitest";
import { isArtifactRef } from "../../artifacts/artifact-util";

/**
 * Twelfth leftover: isArtifactRef is `fileUri && fileUri.startsWith(...)`.
 * Eleventh leftover pins string scheme/whitespace. Non-string falsy values
 * short-circuit to false; truthy non-strings throw on `.startsWith`.
 */
describe("artifact-util isArtifactRef non-string fileUri twelfth leftover", () => {
	it.each([
		{ label: "0", fileUri: 0 },
		{ label: "false", fileUri: false },
		{ label: "empty string", fileUri: "" },
		{ label: "NaN", fileUri: Number.NaN },
		{ label: "null", fileUri: null },
		{ label: "undefined", fileUri: undefined },
	])("falsy non-string $label short-circuits to false", ({ fileUri }) => {
		expect(
			isArtifactRef({
				fileData: { fileUri, mimeType: "text/plain" } as any,
			}),
		).toBe(false);
	});

	it.each([
		{ label: "1", fileUri: 1 },
		{ label: "true", fileUri: true },
		{ label: "object", fileUri: { href: "artifact://" } },
	])("truthy non-string $label throws TypeError on startsWith", ({
		fileUri,
	}) => {
		expect(() =>
			isArtifactRef({
				fileData: { fileUri, mimeType: "text/plain" } as any,
			}),
		).toThrow(TypeError);
	});

	it("string artifact:// still true (control)", () => {
		expect(
			isArtifactRef({
				fileData: {
					fileUri: "artifact://apps/a/users/u/artifacts/f/versions/1",
					mimeType: "text/plain",
				},
			}),
		).toBe(true);
	});
});
