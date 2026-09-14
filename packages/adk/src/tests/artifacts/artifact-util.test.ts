import { describe, expect, it } from "vitest";
import {
	getArtifactUri,
	isArtifactRef,
	parseArtifactUri,
} from "../../artifacts/artifact-util";

describe("parseArtifactUri", () => {
	it("should parse a valid session-scoped artifact URI", () => {
		const uri =
			"artifact://apps/app1/users/user1/sessions/session1/artifacts/file1/versions/123";
		const parsed = parseArtifactUri(uri);
		expect(parsed).not.toBeNull();
		expect(parsed?.appName).toBe("app1");
		expect(parsed?.userId).toBe("user1");
		expect(parsed?.sessionId).toBe("session1");
		expect(parsed?.filename).toBe("file1");
		expect(parsed?.version).toBe(123);
	});

	it("should parse a valid user-scoped artifact URI", () => {
		const uri = "artifact://apps/app2/users/user2/artifacts/file2/versions/456";
		const parsed = parseArtifactUri(uri);
		expect(parsed).not.toBeNull();
		expect(parsed?.appName).toBe("app2");
		expect(parsed?.userId).toBe("user2");
		expect(parsed?.sessionId).toBeUndefined();
		expect(parsed?.filename).toBe("file2");
		expect(parsed?.version).toBe(456);
	});

	it("should return null for invalid URIs", () => {
		const invalidUris = [
			"http://example.com",
			"artifact://invalid",
			"artifact://app1/user1/sessions/session1/artifacts/file1",
			"artifact://apps/app1/users/user1/sessions/session1/artifacts/file1",
			"artifact://apps/app1/users/user1/artifacts/file1",
		];

		for (const uri of invalidUris) {
			expect(parseArtifactUri(uri)).toBeNull();
		}
	});

	it("returns null for empty, non-artifact, and malformed path shapes", () => {
		expect(parseArtifactUri("")).toBeNull();
		expect(parseArtifactUri("artifact://")).toBeNull();
		expect(
			parseArtifactUri("artifact:/apps/a/users/u/artifacts/f/versions/1"),
		).toBeNull();
		expect(
			parseArtifactUri(
				"artifact://apps/a/users/u/sessions/s/artifacts/nested/path/versions/1",
			),
		).toBeNull();
		expect(
			parseArtifactUri(
				"artifact://apps/a/users/u/artifacts/f/versions/1/extra",
			),
		).toBeNull();
		expect(
			parseArtifactUri(
				"artifact://apps/a/users/u/sessions/s/artifacts/f/versions/not-a-number",
			),
		).toBeNull();
	});

	it("parses version 0 and round-trips with getArtifactUri", () => {
		const sessionUri = getArtifactUri({
			appName: "demo",
			userId: "u1",
			sessionId: "s1",
			filename: "note.txt",
			version: 0,
		});
		expect(parseArtifactUri(sessionUri)).toEqual({
			appName: "demo",
			userId: "u1",
			sessionId: "s1",
			filename: "note.txt",
			version: 0,
		});

		const userUri = getArtifactUri({
			appName: "demo",
			userId: "u1",
			filename: "user:profile.json",
			version: 9,
		});
		expect(parseArtifactUri(userUri)).toEqual({
			appName: "demo",
			userId: "u1",
			sessionId: undefined,
			filename: "user:profile.json",
			version: 9,
		});
	});

	it("does not treat session-shaped URIs as user-scoped", () => {
		const uri =
			"artifact://apps/app/users/user/sessions/sess/artifacts/f/versions/2";
		const parsed = parseArtifactUri(uri);
		expect(parsed?.sessionId).toBe("sess");
		expect(parsed?.filename).toBe("f");
		expect(parsed?.version).toBe(2);
	});
});

describe("getArtifactUri", () => {
	it("should construct a session-scoped artifact URI", () => {
		const uri = getArtifactUri({
			appName: "app1",
			userId: "user1",
			sessionId: "session1",
			filename: "file1",
			version: 123,
		});
		expect(uri).toBe(
			"artifact://apps/app1/users/user1/sessions/session1/artifacts/file1/versions/123",
		);
	});

	it("should construct a user-scoped artifact URI", () => {
		const uri = getArtifactUri({
			appName: "app2",
			userId: "user2",
			filename: "file2",
			version: 456,
		});
		expect(uri).toBe(
			"artifact://apps/app2/users/user2/artifacts/file2/versions/456",
		);
	});

	it("treats empty sessionId as falsy and emits a user-scoped URI", () => {
		const uri = getArtifactUri({
			appName: "app",
			userId: "user",
			sessionId: "",
			filename: "f.txt",
			version: 1,
		});
		expect(uri).toBe(
			"artifact://apps/app/users/user/artifacts/f.txt/versions/1",
		);
		expect(parseArtifactUri(uri)?.sessionId).toBeUndefined();
	});

	it("preserves special characters in path segments without encoding", () => {
		const uri = getArtifactUri({
			appName: "my-app",
			userId: "user_1",
			sessionId: "sess-2",
			filename: "user:data.json",
			version: 3,
		});
		expect(uri).toContain(
			"/users/user_1/sessions/sess-2/artifacts/user:data.json/",
		);
		expect(parseArtifactUri(uri)?.filename).toBe("user:data.json");
	});
});

describe("isArtifactRef", () => {
	it("should return true for a valid artifact reference", () => {
		const artifact = {
			fileData: {
				fileUri: "artifact://apps/a/users/u/sessions/s/artifacts/f/versions/1",
				mimeType: "text/plain",
			},
		};
		expect(isArtifactRef(artifact)).toBe(true);
	});

	it("should return false for non-reference parts", () => {
		const nonRefParts = [
			{ text: "hello" },
			{
				inlineData: { data: "AQID", mimeType: "text/plain" },
			},
			{
				fileData: {
					fileUri: "http://example.com",
					mimeType: "text/plain",
				},
			},
			{},
		];

		for (const part of nonRefParts) {
			expect(isArtifactRef(part)).toBe(false);
		}
	});

	it("is true for any artifact:// prefix even when parse would fail", () => {
		expect(
			isArtifactRef({
				fileData: { fileUri: "artifact://not-valid", mimeType: "text/plain" },
			}),
		).toBe(true);
		expect(
			isArtifactRef({
				fileData: { fileUri: "artifact://", mimeType: "text/plain" },
			}),
		).toBe(true);
	});

	it("is false when fileUri is missing, empty, or only whitespace-adjacent schemes", () => {
		expect(isArtifactRef({ fileData: { mimeType: "text/plain" } as any })).toBe(
			false,
		);
		expect(
			isArtifactRef({
				fileData: { fileUri: "", mimeType: "text/plain" },
			}),
		).toBe(false);
		expect(
			isArtifactRef({
				fileData: {
					fileUri: "ARTIFACT://apps/a/users/u/artifacts/f/versions/1",
					mimeType: "text/plain",
				},
			}),
		).toBe(false);
	});

	it("parseArtifactUri returns null for non-artifact schemes and partial paths", () => {
		expect(parseArtifactUri("gs://bucket/obj")).toBeNull();
		expect(parseArtifactUri("artifact://apps/only")).toBeNull();
		expect(
			parseArtifactUri(
				"artifact://apps/a/users/u/sessions/s/artifacts/f/versions/x",
			),
		).toBeNull();
	});

	it("parseArtifactUri accepts version 0 for session and user scopes", () => {
		expect(
			parseArtifactUri(
				"artifact://apps/a/users/u/sessions/s/artifacts/f/versions/0",
			),
		).toEqual({
			appName: "a",
			userId: "u",
			sessionId: "s",
			filename: "f",
			version: 0,
		});
		expect(
			parseArtifactUri("artifact://apps/a/users/u/artifacts/f/versions/0"),
		).toEqual({
			appName: "a",
			userId: "u",
			sessionId: undefined,
			filename: "f",
			version: 0,
		});
	});

	it("getArtifactUri builds session and user scoped URIs", () => {
		expect(
			getArtifactUri({
				appName: "app",
				userId: "u",
				sessionId: "s",
				filename: "f.txt",
				version: 3,
			}),
		).toBe("artifact://apps/app/users/u/sessions/s/artifacts/f.txt/versions/3");
		expect(
			getArtifactUri({
				appName: "app",
				userId: "u",
				filename: "user:f.txt",
				version: 1,
			}),
		).toBe("artifact://apps/app/users/u/artifacts/user:f.txt/versions/1");
	});

	it("round-trips getArtifactUri through parseArtifactUri", () => {
		const sessionUri = getArtifactUri({
			appName: "demo",
			userId: "alice",
			sessionId: "s1",
			filename: "note.txt",
			version: 2,
		});
		expect(parseArtifactUri(sessionUri)).toEqual({
			appName: "demo",
			userId: "alice",
			sessionId: "s1",
			filename: "note.txt",
			version: 2,
		});
	});
});
