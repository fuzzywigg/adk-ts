import { describe, expect, it } from "vitest";
import {
	getArtifactUri,
	parseArtifactUri,
} from "../../artifacts/artifact-util";

/**
 * Fourteenth leftover: `if (sessionId)` in getArtifactUri — falsy sixth goes
 * user-scoped; thirteenth pins whitespace `" "` session scope. String
 * `"false"` / `"0"` are truthy and embed into the session path.
 */
describe("artifact-util sessionId string-false truthy fourteenth leftover", () => {
	it.each([
		"false",
		"0",
		"null",
		"undefined",
	] as const)("sessionId %j keeps session-scoped URI", (sessionId) => {
		const uri = getArtifactUri({
			appName: "app",
			userId: "uid",
			filename: "f.txt",
			version: 0,
			sessionId,
		});
		expect(uri).toBe(
			`artifact://apps/app/users/uid/sessions/${sessionId}/artifacts/f.txt/versions/0`,
		);
		const parsed = parseArtifactUri(uri);
		expect(parsed?.sessionId).toBe(sessionId);
	});

	it("falsy false still user-scopes (sixth control)", () => {
		const uri = getArtifactUri({
			appName: "app",
			userId: "uid",
			filename: "f.txt",
			version: 0,
			sessionId: false as any,
		});
		expect(uri).toBe(
			"artifact://apps/app/users/uid/artifacts/f.txt/versions/0",
		);
		expect(parseArtifactUri(uri)?.sessionId).toBeUndefined();
	});
});
