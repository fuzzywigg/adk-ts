import { describe, expect, it, vi } from "vitest";
import {
	getArtifactUri,
	parseArtifactUri,
} from "../../artifacts/artifact-util";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

describe("artifact-util heavy matrix leftover edges", () => {
	const base = {
		appName: "app",
		userId: "user-1",
		sessionId: "sess-1",
		filename: "note.txt",
		version: 0,
	};

	it("round-trips getArtifactUri and parseArtifactUri", () => {
		const uri = getArtifactUri(base);
		expect(parseArtifactUri(uri)).toEqual(base);
	});

	it("encodes user-scoped filenames with user: prefix", () => {
		const uri = getArtifactUri({ ...base, filename: "user:prefs.json" });
		const parsed = parseArtifactUri(uri);
		expect(parsed?.filename).toBe("user:prefs.json");
	});

	it("supports unicode filenames and app names", () => {
		const uri = getArtifactUri({
			...base,
			appName: "アプリ",
			filename: "メモ.txt",
			version: 2,
		});
		const parsed = parseArtifactUri(uri);
		expect(parsed?.appName).toBe("アプリ");
		expect(parsed?.filename).toBe("メモ.txt");
		expect(parsed?.version).toBe(2);
	});

	it("rejects clearly invalid URIs", () => {
		expect(parseArtifactUri("not-a-uri")).toBeNull();
		expect(parseArtifactUri("")).toBeNull();
		expect(parseArtifactUri("http://example.com/x")).toBeNull();
	});

	it("distinguishes versions in URI path", () => {
		const v0 = getArtifactUri({ ...base, version: 0 });
		const v1 = getArtifactUri({ ...base, version: 1 });
		expect(v0).not.toBe(v1);
		expect(parseArtifactUri(v0)?.version).toBe(0);
		expect(parseArtifactUri(v1)?.version).toBe(1);
	});
});

describe("InMemoryArtifactService heavy matrix leftover edges", () => {
	const base = {
		appName: "app",
		userId: "user-1",
		sessionId: "session-1",
	};

	it("versions increment and latest load returns newest", async () => {
		const service = new InMemoryArtifactService();
		expect(
			await service.saveArtifact({
				...base,
				filename: "a.txt",
				artifact: { text: "v0" },
			}),
		).toBe(0);
		expect(
			await service.saveArtifact({
				...base,
				filename: "a.txt",
				artifact: { text: "v1" },
			}),
		).toBe(1);
		expect(await service.loadArtifact({ ...base, filename: "a.txt" })).toEqual({
			text: "v1",
		});
		expect(
			await service.loadArtifact({ ...base, filename: "a.txt", version: 0 }),
		).toEqual({ text: "v0" });
	});

	it("listVersions returns dense version indices", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "b.txt",
			artifact: { text: "0" },
		});
		await service.saveArtifact({
			...base,
			filename: "b.txt",
			artifact: { text: "1" },
		});
		expect(await service.listVersions({ ...base, filename: "b.txt" })).toEqual([
			0, 1,
		]);
	});

	it("isolates session-scoped keys across sessions", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			sessionId: "s1",
			filename: "x.txt",
			artifact: { text: "one" },
		});
		await service.saveArtifact({
			...base,
			sessionId: "s2",
			filename: "x.txt",
			artifact: { text: "two" },
		});
		expect(
			await service.loadArtifact({
				...base,
				sessionId: "s1",
				filename: "x.txt",
			}),
		).toEqual({ text: "one" });
		expect(
			await service.loadArtifact({
				...base,
				sessionId: "s2",
				filename: "x.txt",
			}),
		).toEqual({ text: "two" });
	});

	it("shares user: artifacts across sessions for the same user", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			sessionId: "s1",
			filename: "user:pref.txt",
			artifact: { text: "pref" },
		});
		expect(
			await service.loadArtifact({
				...base,
				sessionId: "s2",
				filename: "user:pref.txt",
			}),
		).toEqual({ text: "pref" });
	});

	it("deleteArtifact removes all versions for a filename", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "del.txt",
			artifact: { text: "0" },
		});
		await service.saveArtifact({
			...base,
			filename: "del.txt",
			artifact: { text: "1" },
		});
		await service.deleteArtifact({ ...base, filename: "del.txt" });
		expect(
			await service.loadArtifact({ ...base, filename: "del.txt" }),
		).toBeNull();
		expect(
			await service.listVersions({ ...base, filename: "del.txt" }),
		).toEqual([]);
	});

	it("listArtifactKeys includes session and user-scoped names", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "s.txt",
			artifact: { text: "s" },
		});
		await service.saveArtifact({
			...base,
			filename: "user:u.txt",
			artifact: { text: "u" },
		});
		const keys = await service.listArtifactKeys(base);
		expect(keys.sort()).toEqual(["s.txt", "user:u.txt"].sort());
	});

	it("negative -1 loads latest; out-of-range positive returns null", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "c.txt",
			artifact: { text: "only" },
		});
		expect(
			await service.loadArtifact({ ...base, filename: "c.txt", version: -1 }),
		).toEqual({ text: "only" });
		expect(
			await service.loadArtifact({ ...base, filename: "c.txt", version: 5 }),
		).toBeNull();
	});

	it("follows a ref artifact to its target URI", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "target.txt",
			artifact: { text: "payload" },
		});
		const uri = getArtifactUri({
			...base,
			filename: "target.txt",
			version: 0,
		});
		await service.saveArtifact({
			...base,
			filename: "ref.txt",
			artifact: { fileData: { fileUri: uri, mimeType: "text/plain" } },
		});
		expect(
			await service.loadArtifact({ ...base, filename: "ref.txt" }),
		).toEqual({ text: "payload" });
	});

	it("saveArtifact accepts inlineData artifacts", async () => {
		const service = new InMemoryArtifactService();
		const version = await service.saveArtifact({
			...base,
			filename: "bin.bin",
			artifact: {
				inlineData: { data: "aGVsbG8=", mimeType: "application/octet-stream" },
			},
		});
		expect(version).toBe(0);
		expect(
			await service.loadArtifact({ ...base, filename: "bin.bin" }),
		).toEqual({
			inlineData: { data: "aGVsbG8=", mimeType: "application/octet-stream" },
		});
	});

	it("does not leak artifacts across appName boundaries", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			appName: "app-a",
			userId: "u",
			sessionId: "s",
			filename: "x.txt",
			artifact: { text: "a" },
		});
		expect(
			await service.loadArtifact({
				appName: "app-b",
				userId: "u",
				sessionId: "s",
				filename: "x.txt",
			}),
		).toBeNull();
	});
});

describe("InMemoryArtifactService concurrency heavy matrix", () => {
	it("assigns distinct versions under concurrent saves", async () => {
		const service = new InMemoryArtifactService();
		const base = {
			appName: "app",
			userId: "user",
			sessionId: "sess",
			filename: "race.txt",
		};
		const versions = await Promise.all(
			Array.from({ length: 10 }, (_, i) =>
				service.saveArtifact({ ...base, artifact: { text: `v${i}` } }),
			),
		);
		expect(new Set(versions).size).toBe(10);
		expect(await service.listVersions(base)).toHaveLength(10);
	});
});
