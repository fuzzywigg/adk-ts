import { describe, expect, it } from "vitest";
import {
	getArtifactUri,
	isArtifactRef,
	parseArtifactUri,
} from "../../artifacts/artifact-util";

describe("artifact-util matrix leftover edges", () => {
	it("round-trips session-scoped URIs including version 0", () => {
		const uri = getArtifactUri({
			appName: "app",
			userId: "user",
			sessionId: "sess",
			filename: "note.txt",
			version: 0,
		});
		expect(uri).toBe(
			"artifact://apps/app/users/user/sessions/sess/artifacts/note.txt/versions/0",
		);
		expect(parseArtifactUri(uri)).toEqual({
			appName: "app",
			userId: "user",
			sessionId: "sess",
			filename: "note.txt",
			version: 0,
		});
	});

	it("round-trips user-scoped URIs when sessionId is omitted", () => {
		const uri = getArtifactUri({
			appName: "app",
			userId: "user",
			filename: "pref.json",
			version: 3,
		});
		expect(uri).toBe(
			"artifact://apps/app/users/user/artifacts/pref.json/versions/3",
		);
		expect(parseArtifactUri(uri)).toEqual({
			appName: "app",
			userId: "user",
			sessionId: undefined,
			filename: "pref.json",
			version: 3,
		});
	});

	it("treats empty sessionId as user-scoped", () => {
		const uri = getArtifactUri({
			appName: "a",
			userId: "u",
			sessionId: "",
			filename: "f",
			version: 1,
		});
		expect(uri).toBe("artifact://apps/a/users/u/artifacts/f/versions/1");
		expect(parseArtifactUri(uri)?.sessionId).toBeUndefined();
	});

	it("rejects near-miss schemes and truncated paths", () => {
		expect(
			parseArtifactUri("artifacts://apps/a/users/u/artifacts/f/versions/1"),
		).toBeNull();
		expect(
			parseArtifactUri("artifact:/apps/a/users/u/artifacts/f/versions/1"),
		).toBeNull();
		expect(
			parseArtifactUri("artifact://apps/a/users/u/artifacts/f"),
		).toBeNull();
		expect(
			parseArtifactUri(
				"artifact://apps/a/users/u/sessions/s/artifacts/f/versions/x",
			),
		).toBeNull();
	});

	it("preserves special characters in path segments without encoding", () => {
		const uri = getArtifactUri({
			appName: "my app",
			userId: "u@x",
			sessionId: "s1",
			filename: "file name.txt",
			version: 2,
		});
		expect(uri).toContain("my app");
		expect(uri).toContain("u@x");
		expect(uri).toContain("file name.txt");
		expect(parseArtifactUri(uri)).toEqual({
			appName: "my app",
			userId: "u@x",
			sessionId: "s1",
			filename: "file name.txt",
			version: 2,
		});
	});

	it("isArtifactRef requires artifact:// fileUri", () => {
		expect(
			isArtifactRef({
				fileData: {
					fileUri: "artifact://apps/a/users/u/artifacts/f/versions/1",
				},
			} as any),
		).toBe(true);
		expect(
			isArtifactRef({
				fileData: { fileUri: "gs://bucket/obj" },
			} as any),
		).toBe(false);
		expect(isArtifactRef({ text: "hi" } as any)).toBe(false);
		expect(isArtifactRef({ fileData: {} } as any)).toBe(false);
		expect(
			isArtifactRef({
				fileData: {
					fileUri: "  artifact://apps/a/users/u/artifacts/f/versions/1",
				},
			} as any),
		).toBe(false);
	});

	it("parseArtifactUri returns null for whitespace-only and non-artifact strings", () => {
		expect(parseArtifactUri("   ")).toBeNull();
		expect(parseArtifactUri("http://example.com")).toBeNull();
		expect(parseArtifactUri("artifact://")).toBeNull();
	});

	it("does not confuse session-shaped URIs for user-scoped ones", () => {
		const sessionUri =
			"artifact://apps/a/users/u/sessions/s/artifacts/f/versions/1";
		const parsed = parseArtifactUri(sessionUri);
		expect(parsed?.sessionId).toBe("s");
		expect(parsed?.filename).toBe("f");
	});

	it("getArtifactUri + parseArtifactUri survive large version numbers", () => {
		const uri = getArtifactUri({
			appName: "a",
			userId: "u",
			sessionId: "s",
			filename: "f",
			version: 1_000_000,
		});
		expect(parseArtifactUri(uri)?.version).toBe(1_000_000);
	});
});
