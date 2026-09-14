import { describe, expect, it } from "vitest";
import {
	getArtifactUri,
	isArtifactRef,
	parseArtifactUri,
} from "../../artifacts/artifact-util";

describe("artifact-util leftover edges", () => {
	it("parseArtifactUri returns null for nullish and non-string-like inputs", () => {
		expect(parseArtifactUri(null as any)).toBeNull();
		expect(parseArtifactUri(undefined as any)).toBeNull();
		expect(parseArtifactUri("" as any)).toBeNull();
	});

	it("rejects URIs with query strings, hashes, or trailing slashes", () => {
		const base = "artifact://apps/a/users/u/sessions/s/artifacts/f/versions/1";
		expect(parseArtifactUri(`${base}?x=1`)).toBeNull();
		expect(parseArtifactUri(`${base}#frag`)).toBeNull();
		expect(parseArtifactUri(`${base}/`)).toBeNull();
	});

	it("rejects empty path segments and negative versions", () => {
		expect(
			parseArtifactUri(
				"artifact://apps/a/users/u/sessions//artifacts/f/versions/1",
			),
		).toBeNull();
		expect(
			parseArtifactUri(
				"artifact://apps/a/users/u/sessions/s/artifacts/f/versions/-1",
			),
		).toBeNull();
	});

	it("parses leading-zero versions via parseInt", () => {
		expect(
			parseArtifactUri(
				"artifact://apps/a/users/u/sessions/s/artifacts/f/versions/007",
			),
		).toEqual({
			appName: "a",
			userId: "u",
			sessionId: "s",
			filename: "f",
			version: 7,
		});
	});

	it("getArtifactUri with undefined sessionId matches omitted sessionId", () => {
		const withUndef = getArtifactUri({
			appName: "app",
			userId: "u",
			filename: "f.txt",
			version: 1,
			sessionId: undefined,
		});
		const omitted = getArtifactUri({
			appName: "app",
			userId: "u",
			filename: "f.txt",
			version: 1,
		});
		expect(withUndef).toBe(omitted);
		expect(withUndef).toBe(
			"artifact://apps/app/users/u/artifacts/f.txt/versions/1",
		);
	});

	it("isArtifactRef requires artifact:// not artifact:", () => {
		expect(
			isArtifactRef({
				fileData: { fileUri: "artifact:", mimeType: "text/plain" },
			}),
		).toBe(false);
		expect(
			isArtifactRef({
				text: "ignore",
				fileData: {
					fileUri: "artifact://apps/a/users/u/artifacts/f/versions/0",
					mimeType: "text/plain",
				},
			}),
		).toBe(true);
	});

	it("round-trips unicode filenames that do not contain slashes", () => {
		const uri = getArtifactUri({
			appName: "アプリ",
			userId: "用户",
			sessionId: "会话",
			filename: "笔记.txt",
			version: 2,
		});
		expect(parseArtifactUri(uri)).toEqual({
			appName: "アプリ",
			userId: "用户",
			sessionId: "会话",
			filename: "笔记.txt",
			version: 2,
		});
	});

	it("user-scoped parse leaves sessionId strictly undefined", () => {
		const parsed = parseArtifactUri(
			"artifact://apps/a/users/u/artifacts/f/versions/0",
		);
		expect(parsed).toEqual({
			appName: "a",
			userId: "u",
			sessionId: undefined,
			filename: "f",
			version: 0,
		});
		expect(Object.hasOwn(parsed!, "sessionId")).toBe(true);
		expect(parsed!.sessionId).toBeUndefined();
	});

	it("rejects schemes that only look similar", () => {
		expect(
			parseArtifactUri(
				"artifacts://apps/a/users/u/sessions/s/artifacts/f/versions/1",
			),
		).toBeNull();
		expect(
			parseArtifactUri(
				"http://apps/a/users/u/sessions/s/artifacts/f/versions/1",
			),
		).toBeNull();
	});

	it("getArtifactUri + parseArtifactUri round-trip for session scope", () => {
		const uri = getArtifactUri({
			appName: "demo",
			userId: "alice",
			sessionId: "s1",
			filename: "note.txt",
			version: 3,
		});
		expect(parseArtifactUri(uri)).toEqual({
			appName: "demo",
			userId: "alice",
			sessionId: "s1",
			filename: "note.txt",
			version: 3,
		});
	});
});
