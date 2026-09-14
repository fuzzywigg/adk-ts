import { describe, expect, it } from "vitest";
import {
	getArtifactUri,
	isArtifactRef,
	parseArtifactUri,
} from "../../artifacts/artifact-util";

/**
 * Leftover: getArtifactUri uses truthy sessionId. Falsy "" / 0 / false / null
 * collapse to user-scoped URI even when caller intended session scope.
 */
describe("artifact-util sixth leftover: falsy sessionId → user scope", () => {
	const falsySessionIds: Array<{ label: string; sessionId: any }> = [
		{ label: "empty-string", sessionId: "" },
		{ label: "zero", sessionId: 0 },
		{ label: "false", sessionId: false },
		{ label: "null", sessionId: null },
		{ label: "undefined", sessionId: undefined },
		{ label: "NaN", sessionId: Number.NaN },
	];

	for (const { label, sessionId } of falsySessionIds) {
		it(`sessionId=${label} builds user-scoped URI`, () => {
			const uri = getArtifactUri({
				appName: "a",
				userId: "u",
				filename: "f.txt",
				version: 3,
				sessionId,
			});
			expect(uri).toBe("artifact://apps/a/users/u/artifacts/f.txt/versions/3");
			expect(parseArtifactUri(uri)?.sessionId).toBeUndefined();
		});
	}

	it("truthy sessionId '0' string keeps session scope", () => {
		const uri = getArtifactUri({
			appName: "a",
			userId: "u",
			filename: "f.txt",
			version: 1,
			sessionId: "0",
		});
		expect(uri).toContain("/sessions/0/");
		expect(parseArtifactUri(uri)?.sessionId).toBe("0");
	});

	it("leading-zero version parseInt drops zero pad", () => {
		expect(
			parseArtifactUri("artifact://apps/a/users/u/artifacts/f/versions/07"),
		).toEqual({
			appName: "a",
			userId: "u",
			sessionId: undefined,
			filename: "f",
			version: 7,
		});
	});

	it("isArtifactRef false for empty fileUri string", () => {
		expect(
			isArtifactRef({
				fileData: { fileUri: "", mimeType: "text/plain" },
			}),
		).toBe(false);
	});

	it("isArtifactRef false when fileData missing fileUri", () => {
		expect(
			isArtifactRef({
				fileData: { mimeType: "text/plain" } as any,
			}),
		).toBe(false);
	});

	it("parse rejects slash inside filename segment", () => {
		expect(
			parseArtifactUri("artifact://apps/a/users/u/artifacts/dir/f/versions/1"),
		).toBeNull();
	});

	it("round-trip: falsy sessionId get then parse stays user-scoped", () => {
		const uri = getArtifactUri({
			appName: "app",
			userId: "user",
			filename: "user:doc.txt",
			version: 0,
			sessionId: "",
		});
		expect(parseArtifactUri(uri)).toEqual({
			appName: "app",
			userId: "user",
			sessionId: undefined,
			filename: "user:doc.txt",
			version: 0,
		});
	});
});
