import { describe, expect, it } from "vitest";
import {
	getArtifactUri,
	parseArtifactUri,
} from "../../artifacts/artifact-util";

/**
 * Thirteenth leftover: getArtifactUri `if (sessionId)` — whitespace and "0"
 * are truthy session scope (remainder/tenth touched " "). Empty app/user/file
 * segments still round-trip through the regex `[^/]+` when non-empty after
 * build; empty filename in hand-built URI rejects (sixth). This pins version 0
 * with whitespace sessionId parse round-trip.
 */
describe("artifact-util whitespace sessionId version0 thirteenth leftover", () => {
	it.each([
		{ label: "single space", sessionId: " " },
		{ label: "tabs", sessionId: "\t" },
		{ label: "string 0", sessionId: "0" },
	])("truthy sessionId $label keeps session scope at version 0", ({
		sessionId,
	}) => {
		const uri = getArtifactUri({
			appName: "a",
			userId: "u",
			filename: "f.txt",
			version: 0,
			sessionId,
		});
		expect(uri).toContain(`/sessions/${sessionId}/`);
		expect(uri.endsWith("/versions/0")).toBe(true);
		expect(parseArtifactUri(uri)).toEqual({
			appName: "a",
			userId: "u",
			sessionId,
			filename: "f.txt",
			version: 0,
		});
	});

	it("empty sessionId still collapses to user scope (sixth control)", () => {
		const uri = getArtifactUri({
			appName: "a",
			userId: "u",
			filename: "f.txt",
			version: 0,
			sessionId: "",
		});
		expect(uri).toBe("artifact://apps/a/users/u/artifacts/f.txt/versions/0");
		expect(parseArtifactUri(uri)?.sessionId).toBeUndefined();
	});
});
