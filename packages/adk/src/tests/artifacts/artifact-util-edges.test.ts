import { describe, expect, it } from "vitest";
import {
	getArtifactUri,
	isArtifactRef,
	parseArtifactUri,
} from "../../artifacts/artifact-util";

describe("artifact-util leftover edges", () => {
	it("round-trips unicode and special path segments", () => {
		const uri = getArtifactUri({
			appName: "アプリ",
			userId: "ユーザー",
			sessionId: "セッション",
			filename: "ファイル-名前.txt",
			version: 42,
		});
		expect(parseArtifactUri(uri)).toEqual({
			appName: "アプリ",
			userId: "ユーザー",
			sessionId: "セッション",
			filename: "ファイル-名前.txt",
			version: 42,
		});
	});

	it("rejects URIs with empty path segments", () => {
		expect(
			parseArtifactUri(
				"artifact://apps//users/u/sessions/s/artifacts/f/versions/1",
			),
		).toBeNull();
		expect(
			parseArtifactUri("artifact://apps/a/users//artifacts/f/versions/1"),
		).toBeNull();
	});

	it("rejects non-numeric versions and negative versions via regex", () => {
		expect(
			parseArtifactUri(
				"artifact://apps/a/users/u/sessions/s/artifacts/f/versions/01x",
			),
		).toBeNull();
		expect(
			parseArtifactUri("artifact://apps/a/users/u/artifacts/f/versions/-1"),
		).toBeNull();
	});

	it("user-scoped URI omits sessionId in parsed result", () => {
		const uri = getArtifactUri({
			appName: "a",
			userId: "u",
			filename: "user:profile.json",
			version: 0,
		});
		expect(uri).toBe(
			"artifact://apps/a/users/u/artifacts/user:profile.json/versions/0",
		);
		expect(parseArtifactUri(uri)).toEqual({
			appName: "a",
			userId: "u",
			sessionId: undefined,
			filename: "user:profile.json",
			version: 0,
		});
	});

	it("parseArtifactUri returns null for non-artifact schemes", () => {
		expect(parseArtifactUri("https://example.com/x")).toBeNull();
		expect(parseArtifactUri("gs://bucket/obj")).toBeNull();
		expect(parseArtifactUri("")).toBeNull();
	});

	it("isArtifactRef is case-sensitive on the scheme prefix", () => {
		expect(
			isArtifactRef({
				fileData: {
					fileUri: "Artifact://apps/a/users/u/artifacts/f/versions/1",
					mimeType: "text/plain",
				},
			}),
		).toBe(false);
	});

	it("getArtifactUri with empty sessionId uses session-scoped path", () => {
		const uri = getArtifactUri({
			appName: "a",
			userId: "u",
			sessionId: "",
			filename: "f.txt",
			version: 1,
		});
		// empty string is falsy → user-scoped branch
		expect(uri).toBe("artifact://apps/a/users/u/artifacts/f.txt/versions/1");
	});

	it("version 0 is preserved through parse", () => {
		const uri = getArtifactUri({
			appName: "a",
			userId: "u",
			sessionId: "s",
			filename: "f",
			version: 0,
		});
		expect(parseArtifactUri(uri)?.version).toBe(0);
	});
});
