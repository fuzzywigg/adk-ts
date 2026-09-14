import { describe, expect, it } from "vitest";
import {
	getArtifactUri,
	parseArtifactUri,
} from "../../artifacts/artifact-util";

/**
 * Eighteenth leftover: `if (sessionId)` in getArtifactUri — fourteenth pins
 * string `"false"` / `"0"` session scope; sixth pins falsy user-scope.
 * Boolean `true` is truthy and embeds as `"true"`; empty array `[]` is
 * truthy but stringifies to "" → empty session path segment.
 */
describe("artifact-util sessionId boolean-true / empty-array eighteenth leftover", () => {
	it("sessionId true keeps session-scoped URI with literal true", () => {
		const uri = getArtifactUri({
			appName: "app",
			userId: "uid",
			filename: "f.txt",
			version: 0,
			sessionId: true as any,
		});
		expect(uri).toBe(
			"artifact://apps/app/users/uid/sessions/true/artifacts/f.txt/versions/0",
		);
		expect(parseArtifactUri(uri)?.sessionId).toBe("true");
	});

	it("sessionId [] keeps session scope with empty session segment", () => {
		const uri = getArtifactUri({
			appName: "app",
			userId: "uid",
			filename: "f.txt",
			version: 0,
			sessionId: [] as any,
		});
		expect(uri).toBe(
			"artifact://apps/app/users/uid/sessions//artifacts/f.txt/versions/0",
		);
		expect(parseArtifactUri(uri)).toBeNull();
	});

	it('string "false" still session-scopes (fourteenth control)', () => {
		const uri = getArtifactUri({
			appName: "app",
			userId: "uid",
			filename: "f.txt",
			version: 0,
			sessionId: "false",
		});
		expect(uri).toContain("/sessions/false/");
		expect(parseArtifactUri(uri)?.sessionId).toBe("false");
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
	});
});
