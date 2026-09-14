import { describe, expect, it } from "vitest";
import { getArtifactUri } from "../../artifacts/artifact-util";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

describe("InMemoryArtifactService heavy matrix leftover edges", () => {
	const base = {
		appName: "app",
		userId: "user",
		sessionId: "sess",
	};

	it("versions increment from 0 and load defaults to latest", async () => {
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

	it("user: namespace files ignore sessionId in path isolation", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			sessionId: "s1",
			filename: "user:pref.json",
			artifact: { text: '{"theme":"dark"}' },
		});
		expect(
			await service.loadArtifact({
				...base,
				sessionId: "different-session",
				filename: "user:pref.json",
			}),
		).toEqual({ text: '{"theme":"dark"}' });
	});

	it("session-scoped files do not leak across sessions", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			sessionId: "s1",
			filename: "note.txt",
			artifact: { text: "s1-only" },
		});
		expect(
			await service.loadArtifact({
				...base,
				sessionId: "s2",
				filename: "note.txt",
			}),
		).toBeNull();
	});

	it("listArtifactKeys merges session and user namespace and sorts", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "z.txt",
			artifact: { text: "z" },
		});
		await service.saveArtifact({
			...base,
			filename: "user:a.txt",
			artifact: { text: "a" },
		});
		await service.saveArtifact({
			...base,
			filename: "m.txt",
			artifact: { text: "m" },
		});
		expect(await service.listArtifactKeys(base)).toEqual([
			"m.txt",
			"user:a.txt",
			"z.txt",
		]);
	});

	it("deleteArtifact removes all versions for a path", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "multi.txt",
			artifact: { text: "1" },
		});
		await service.saveArtifact({
			...base,
			filename: "multi.txt",
			artifact: { text: "2" },
		});
		await service.deleteArtifact({ ...base, filename: "multi.txt" });
		expect(
			await service.loadArtifact({ ...base, filename: "multi.txt" }),
		).toBeNull();
		expect(
			await service.listVersions({ ...base, filename: "multi.txt" }),
		).toEqual([]);
	});

	it("deleteArtifact is a no-op for missing filenames", async () => {
		const service = new InMemoryArtifactService();
		await expect(
			service.deleteArtifact({ ...base, filename: "missing.txt" }),
		).resolves.toBeUndefined();
	});

	it("listVersions returns contiguous indices starting at 0", async () => {
		const service = new InMemoryArtifactService();
		for (let i = 0; i < 4; i++) {
			await service.saveArtifact({
				...base,
				filename: "v.txt",
				artifact: { text: `t${i}` },
			});
		}
		expect(await service.listVersions({ ...base, filename: "v.txt" })).toEqual([
			0, 1, 2, 3,
		]);
	});

	it("listVersions is empty for unknown files", async () => {
		const service = new InMemoryArtifactService();
		expect(
			await service.listVersions({ ...base, filename: "none.txt" }),
		).toEqual([]);
	});

	it("negative versions wrap from the end", async () => {
		const service = new InMemoryArtifactService();
		for (const text of ["a", "b", "c"]) {
			await service.saveArtifact({
				...base,
				filename: "neg.txt",
				artifact: { text },
			});
		}
		expect(
			await service.loadArtifact({
				...base,
				filename: "neg.txt",
				version: -1,
			}),
		).toEqual({ text: "c" });
		expect(
			await service.loadArtifact({
				...base,
				filename: "neg.txt",
				version: -3,
			}),
		).toEqual({ text: "a" });
		expect(
			await service.loadArtifact({
				...base,
				filename: "neg.txt",
				version: -4,
			}),
		).toBeNull();
	});

	it("empty inlineData without text or fileData loads as null", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "empty.bin",
			artifact: {
				inlineData: { data: "", mimeType: "application/octet-stream" },
			},
		});
		expect(
			await service.loadArtifact({ ...base, filename: "empty.bin" }),
		).toBeNull();
	});

	it("text artifacts with empty string are treated as empty content (null)", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "blank.txt",
			artifact: { text: "" },
		});
		expect(
			await service.loadArtifact({ ...base, filename: "blank.txt" }),
		).toBeNull();
	});

	it("resolves artifact refs for user-scoped URIs without session", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			appName: "app",
			userId: "user",
			sessionId: "ignored",
			filename: "user:shared.txt",
			artifact: { text: "shared" },
		});
		const uri = getArtifactUri({
			appName: "app",
			userId: "user",
			filename: "user:shared.txt",
			version: 0,
		});
		await service.saveArtifact({
			...base,
			filename: "pointer.txt",
			artifact: { fileData: { fileUri: uri, mimeType: "text/plain" } },
		});
		expect(
			await service.loadArtifact({ ...base, filename: "pointer.txt" }),
		).toEqual({ text: "shared" });
	});

	it("non-artifact fileData URIs load as-is; invalid artifact:// URIs throw", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "plain-ref.txt",
			artifact: {
				fileData: { fileUri: "not-an-artifact-uri", mimeType: "text/plain" },
			},
		});
		expect(
			await service.loadArtifact({ ...base, filename: "plain-ref.txt" }),
		).toEqual({
			fileData: { fileUri: "not-an-artifact-uri", mimeType: "text/plain" },
		});

		await service.saveArtifact({
			...base,
			filename: "bad-ref.txt",
			artifact: {
				fileData: {
					fileUri: "artifact://not-valid",
					mimeType: "text/plain",
				},
			},
		});
		await expect(
			service.loadArtifact({ ...base, filename: "bad-ref.txt" }),
		).rejects.toThrow(/Invalid artifact reference URI/);
	});

	it("fileData without ref resolution returns the entry as-is", async () => {
		const service = new InMemoryArtifactService();
		const artifact = {
			fileData: {
				fileUri: "gs://bucket/object",
				mimeType: "application/octet-stream",
			},
		};
		await service.saveArtifact({
			...base,
			filename: "gcs.txt",
			artifact,
		});
		expect(
			await service.loadArtifact({ ...base, filename: "gcs.txt" }),
		).toEqual(artifact);
	});

	it("inlineData with non-empty data loads successfully", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "bin.dat",
			artifact: {
				inlineData: { data: "aGVsbG8=", mimeType: "text/plain" },
			},
		});
		expect(
			await service.loadArtifact({ ...base, filename: "bin.dat" }),
		).toEqual({
			inlineData: { data: "aGVsbG8=", mimeType: "text/plain" },
		});
	});

	it("does not list artifacts from other apps or users", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			appName: "other",
			userId: "user",
			sessionId: "sess",
			filename: "x.txt",
			artifact: { text: "x" },
		});
		await service.saveArtifact({
			appName: "app",
			userId: "other-user",
			sessionId: "sess",
			filename: "y.txt",
			artifact: { text: "y" },
		});
		expect(await service.listArtifactKeys(base)).toEqual([]);
	});

	it("version null or undefined both resolve to latest", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "latest.txt",
			artifact: { text: "first" },
		});
		await service.saveArtifact({
			...base,
			filename: "latest.txt",
			artifact: { text: "second" },
		});
		expect(
			await service.loadArtifact({
				...base,
				filename: "latest.txt",
				version: undefined,
			}),
		).toEqual({ text: "second" });
		expect(
			await service.loadArtifact({
				...base,
				filename: "latest.txt",
				version: null as any,
			}),
		).toEqual({ text: "second" });
	});

	it("user namespace listing includes filenames with nested path segments", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "user:folder/nested.txt",
			artifact: { text: "nested" },
		});
		expect(await service.listArtifactKeys(base)).toEqual([
			"user:folder/nested.txt",
		]);
	});
});
