import { describe, expect, it } from "vitest";
import {
	getArtifactUri,
	isArtifactRef,
	parseArtifactUri,
} from "../../artifacts/artifact-util";

describe("artifact-util sixth leftover edges (TOKENMAXX after #153)", () => {
	it("round-trips dots underscores hyphens in all segments", () => {
		const uri = getArtifactUri({
			appName: "my.app-1",
			userId: "user_name",
			sessionId: "sess-01",
			filename: "file_v1.txt",
			version: 9,
		});
		expect(parseArtifactUri(uri)).toEqual({
			appName: "my.app-1",
			userId: "user_name",
			sessionId: "sess-01",
			filename: "file_v1.txt",
			version: 9,
		});
	});

	it("round-trips @ and spaces in segments without encoding", () => {
		const uri = getArtifactUri({
			appName: "app name",
			userId: "user@host",
			filename: "my file.txt",
			version: 2,
			sessionId: "s 1",
		});
		expect(parseArtifactUri(uri)).toEqual({
			appName: "app name",
			userId: "user@host",
			sessionId: "s 1",
			filename: "my file.txt",
			version: 2,
		});
	});

	it("user:filename convention round-trips in session scope", () => {
		const uri = getArtifactUri({
			appName: "a",
			userId: "u",
			sessionId: "s",
			filename: "user:notes.json",
			version: 0,
		});
		expect(parseArtifactUri(uri)).toEqual({
			appName: "a",
			userId: "u",
			sessionId: "s",
			filename: "user:notes.json",
			version: 0,
		});
	});

	it("hand-built URI with empty filename segment parses null", () => {
		expect(
			parseArtifactUri(
				"artifact://apps/a/users/u/sessions/s/artifacts//versions/1",
			),
		).toBeNull();
	});

	it("wrong segment order and missing versions reject", () => {
		expect(
			parseArtifactUri("artifact://users/u/apps/a/artifacts/f/versions/1"),
		).toBeNull();
		expect(
			parseArtifactUri("artifact://apps/a/users/u/artifacts/f"),
		).toBeNull();
	});

	it("extra trailing path segment rejects", () => {
		expect(
			parseArtifactUri(
				"artifact://apps/a/users/u/artifacts/f/versions/1/extra",
			),
		).toBeNull();
	});

	it("session-scoped regex wins when sessions segment present", () => {
		const uri = "artifact://apps/a/users/u/sessions/s/artifacts/f/versions/3";
		expect(parseArtifactUri(uri)?.sessionId).toBe("s");
	});

	it("non-numeric +1 version rejects", () => {
		expect(
			parseArtifactUri("artifact://apps/a/users/u/artifacts/f/versions/+1"),
		).toBeNull();
	});

	it("isArtifactRef false for artifact: without // and for gs/http", () => {
		expect(
			isArtifactRef({
				fileData: { fileUri: "artifact:apps/a", mimeType: "text/plain" },
			}),
		).toBe(false);
		expect(
			isArtifactRef({
				fileData: { fileUri: "gs://bucket/obj", mimeType: "text/plain" },
			}),
		).toBe(false);
		expect(
			isArtifactRef({
				fileData: {
					fileUri: "http://example.com/f",
					mimeType: "text/plain",
				},
			}),
		).toBe(false);
	});

	it("get/parse identity for user vs session forms", () => {
		const userScoped = {
			appName: "a",
			userId: "u",
			filename: "f",
			version: 4,
		};
		const sessionScoped = { ...userScoped, sessionId: "s" };
		expect(parseArtifactUri(getArtifactUri(userScoped))).toEqual({
			...userScoped,
			sessionId: undefined,
		});
		expect(parseArtifactUri(getArtifactUri(sessionScoped))).toEqual(
			sessionScoped,
		);
	});
});
