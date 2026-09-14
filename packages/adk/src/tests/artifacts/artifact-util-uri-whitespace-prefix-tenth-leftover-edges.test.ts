import { describe, expect, it } from "vitest";
import {
	getArtifactUri,
	isArtifactRef,
	parseArtifactUri,
} from "../../artifacts/artifact-util";

/**
 * Tenth leftover: parse requires truthy uri AND startsWith("artifact://")
 * with no trim/case-fold; isArtifactRef is prefix-only (parse may still fail).
 */
describe("artifact-util whitespace / prefix tenth leftover", () => {
	it.each([
		" artifact://apps/a/users/u/artifacts/f/versions/1",
		"\tartifact://apps/a/users/u/artifacts/f/versions/1",
		"\nartifact://apps/a/users/u/artifacts/f/versions/1",
		"artifact://apps/a/users/u/artifacts/f/versions/1 ",
	])("leading/trailing whitespace rejects parse %j", (uri) => {
		expect(parseArtifactUri(uri)).toBeNull();
	});

	it.each([
		"ARTIFACT://apps/a/users/u/artifacts/f/versions/1",
		"Artifact://apps/a/users/u/artifacts/f/versions/1",
		"artifact:/apps/a/users/u/artifacts/f/versions/1",
		"artifact:apps/a/users/u/artifacts/f/versions/1",
	])("case / scheme near-miss rejects parse %j", (uri) => {
		expect(parseArtifactUri(uri)).toBeNull();
		expect(
			isArtifactRef({
				fileData: { fileUri: uri, mimeType: "text/plain" },
			}),
		).toBe(false);
	});

	it("isArtifactRef true for bare artifact:// even though parse is null", () => {
		expect(
			isArtifactRef({
				fileData: { fileUri: "artifact://", mimeType: "text/plain" },
			}),
		).toBe(true);
		expect(parseArtifactUri("artifact://")).toBeNull();
	});

	it("isArtifactRef true for artifact://garbage that cannot parse", () => {
		const uri = "artifact://not-a-canonical-path";
		expect(
			isArtifactRef({
				fileData: { fileUri: uri, mimeType: "text/plain" },
			}),
		).toBe(true);
		expect(parseArtifactUri(uri)).toBeNull();
	});

	it('sessionId " " (space) is truthy so getArtifactUri stays session-scoped', () => {
		const uri = getArtifactUri({
			appName: "a",
			userId: "u",
			filename: "f",
			version: 1,
			sessionId: " ",
		});
		expect(uri).toBe(
			"artifact://apps/a/users/u/sessions/ /artifacts/f/versions/1",
		);
		expect(parseArtifactUri(uri)).toEqual({
			appName: "a",
			userId: "u",
			sessionId: " ",
			filename: "f",
			version: 1,
		});
	});

	it.each([
		false,
		0,
		Number.NaN,
	] as const)("parseArtifactUri(%j) is falsy via !uri", (uri) => {
		expect(parseArtifactUri(uri as any)).toBeNull();
	});

	it("fileUri '0' is truthy but does not start with artifact://", () => {
		expect(
			isArtifactRef({
				fileData: { fileUri: "0", mimeType: "text/plain" },
			}),
		).toBe(false);
	});
});
