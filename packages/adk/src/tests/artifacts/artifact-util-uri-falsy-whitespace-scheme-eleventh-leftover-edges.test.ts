import { describe, expect, it } from "vitest";
import { isArtifactRef, parseArtifactUri } from "../../artifacts/artifact-util";

/**
 * Eleventh leftover: parseArtifactUri `if (!uri || !uri.startsWith("artifact://"))`
 * — whitespace is truthy but fails startsWith; near-miss schemes. Distinct from
 * sixth sessionId falsy / ninth user-namespace leftovers.
 */
describe("artifact-util uri falsy whitespace scheme eleventh leftover edges", () => {
	it.each([
		{ label: "empty string", uri: "" },
		{ label: "null", uri: null as any },
		{ label: "undefined", uri: undefined as any },
		{ label: "false", uri: false as any },
		{ label: "0", uri: 0 as any },
	])("!uri short-circuit returns null ($label)", ({ uri }) => {
		expect(parseArtifactUri(uri)).toBeNull();
	});

	it.each([
		{ label: "single space", uri: " " },
		{ label: "tabs", uri: "\t\t" },
		{
			label: "leading space artifact",
			uri: " artifact://apps/a/users/u/artifacts/f/versions/1",
		},
		{
			label: "artifact:/ one slash",
			uri: "artifact:/apps/a/users/u/artifacts/f/versions/1",
		},
		{
			label: "artifacts:// plural",
			uri: "artifacts://apps/a/users/u/artifacts/f/versions/1",
		},
		{ label: "http", uri: "http://apps/a/users/u/artifacts/f/versions/1" },
		{
			label: "Artifact:// case",
			uri: "Artifact://apps/a/users/u/artifacts/f/versions/1",
		},
	])("truthy near-miss / whitespace returns null ($label)", ({ uri }) => {
		expect(parseArtifactUri(uri)).toBeNull();
	});

	it("valid artifact:// still parses (control)", () => {
		expect(
			parseArtifactUri("artifact://apps/a/users/u/artifacts/f/versions/1"),
		).toEqual({
			appName: "a",
			userId: "u",
			sessionId: undefined,
			filename: "f",
			version: 1,
		});
	});

	it("isArtifactRef requires artifact:// — whitespace/near-miss are false", () => {
		expect(
			isArtifactRef({
				fileData: { fileUri: " ", mimeType: "text/plain" },
			}),
		).toBe(false);
		expect(
			isArtifactRef({
				fileData: {
					fileUri: "artifact:/apps/a/users/u/artifacts/f/versions/1",
					mimeType: "text/plain",
				},
			}),
		).toBe(false);
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
