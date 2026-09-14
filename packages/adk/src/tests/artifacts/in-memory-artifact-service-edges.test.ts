import { describe, expect, it } from "vitest";
import { getArtifactUri } from "../../artifacts/artifact-util";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

describe("InMemoryArtifactService leftover edges (post #113)", () => {
	const base = {
		appName: "app",
		userId: "user-1",
		sessionId: "session-1",
	};

	it("returns null when an artifact ref points at a missing target", async () => {
		const service = new InMemoryArtifactService();
		const uri = getArtifactUri({
			...base,
			filename: "missing-target.txt",
			version: 0,
		});
		await service.saveArtifact({
			...base,
			filename: "ref.txt",
			artifact: {
				fileData: { fileUri: uri, mimeType: "text/plain" },
			},
		});

		expect(
			await service.loadArtifact({ ...base, filename: "ref.txt" }),
		).toBeNull();
	});

	it("resolves a session-scoped ref that targets another app/user URI", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			appName: "other-app",
			userId: "other-user",
			sessionId: "other-sess",
			filename: "remote.txt",
			artifact: { text: "cross-scope" },
		});

		const uri = getArtifactUri({
			appName: "other-app",
			userId: "other-user",
			sessionId: "other-sess",
			filename: "remote.txt",
			version: 0,
		});
		await service.saveArtifact({
			...base,
			filename: "pointer.txt",
			artifact: {
				fileData: { fileUri: uri, mimeType: "text/plain" },
			},
		});

		expect(
			await service.loadArtifact({ ...base, filename: "pointer.txt" }),
		).toEqual({ text: "cross-scope" });
	});

	it("listArtifactKeys is empty after deleting all session and user artifacts", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "a.txt",
			artifact: { text: "a" },
		});
		await service.saveArtifact({
			...base,
			filename: "user:b.txt",
			artifact: { text: "b" },
		});
		await service.deleteArtifact({ ...base, filename: "a.txt" });
		await service.deleteArtifact({ ...base, filename: "user:b.txt" });
		expect(await service.listArtifactKeys(base)).toEqual([]);
	});

	it("loadArtifact version === length returns null", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "boundary.txt",
			artifact: { text: "only" },
		});
		expect(
			await service.loadArtifact({
				...base,
				filename: "boundary.txt",
				version: 1,
			}),
		).toBeNull();
	});

	it("negative version equal to -length resolves to index 0", async () => {
		const service = new InMemoryArtifactService();
		for (const text of ["v0", "v1", "v2"]) {
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
				version: -3,
			}),
		).toEqual({ text: "v0" });
	});

	it("listArtifactKeys sorts filenames lexicographically", async () => {
		const service = new InMemoryArtifactService();
		for (const name of ["z.txt", "a.txt", "m.txt", "user:u.txt"]) {
			await service.saveArtifact({
				...base,
				filename: name,
				artifact: { text: name },
			});
		}
		expect(await service.listArtifactKeys(base)).toEqual([
			"a.txt",
			"m.txt",
			"user:u.txt",
			"z.txt",
		]);
	});

	it("keeps truthy text '0' and whitespace", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "zero.txt",
			artifact: { text: "0" },
		});
		await service.saveArtifact({
			...base,
			filename: "space.txt",
			artifact: { text: " " },
		});
		expect(
			await service.loadArtifact({ ...base, filename: "zero.txt" }),
		).toEqual({ text: "0" });
		expect(
			await service.loadArtifact({ ...base, filename: "space.txt" }),
		).toEqual({ text: " " });
	});

	it("keeps fileData artifacts even when text and inlineData are empty", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "filedata.txt",
			artifact: {
				fileData: {
					fileUri: "gs://bucket/obj",
					mimeType: "text/plain",
				},
			},
		});
		expect(
			await service.loadArtifact({ ...base, filename: "filedata.txt" }),
		).toEqual({
			fileData: {
				fileUri: "gs://bucket/obj",
				mimeType: "text/plain",
			},
		});
	});

	it("session isolation: same filename in different sessions stays separate", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			sessionId: "sess-a",
			filename: "note.txt",
			artifact: { text: "a" },
		});
		await service.saveArtifact({
			...base,
			sessionId: "sess-b",
			filename: "note.txt",
			artifact: { text: "b" },
		});

		expect(
			await service.loadArtifact({
				...base,
				sessionId: "sess-a",
				filename: "note.txt",
			}),
		).toEqual({ text: "a" });
		expect(
			await service.listArtifactKeys({ ...base, sessionId: "sess-a" }),
		).toEqual(["note.txt"]);
	});

	it("throws when a ref URI is present but invalid", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "broken-ref.txt",
			artifact: {
				fileData: {
					fileUri: "artifact://",
					mimeType: "text/plain",
				},
			},
		});
		await expect(
			service.loadArtifact({ ...base, filename: "broken-ref.txt" }),
		).rejects.toThrow(/Invalid artifact reference URI/);
	});
});

describe("InMemoryArtifactService leftover edges (post #124)", () => {
	const base = {
		appName: "app",
		userId: "user-1",
		sessionId: "session-1",
	};

	it("rejects circular artifact refs instead of hanging", async () => {
		const service = new InMemoryArtifactService();
		const uriA = getArtifactUri({
			...base,
			filename: "a.txt",
			version: 0,
		});
		const uriB = getArtifactUri({
			...base,
			filename: "b.txt",
			version: 0,
		});
		await service.saveArtifact({
			...base,
			filename: "a.txt",
			artifact: {
				fileData: { fileUri: uriB, mimeType: "text/plain" },
			},
		});
		await service.saveArtifact({
			...base,
			filename: "b.txt",
			artifact: {
				fileData: { fileUri: uriA, mimeType: "text/plain" },
			},
		});

		await expect(
			service.loadArtifact({ ...base, filename: "a.txt" }),
		).rejects.toThrow();
	});

	it("resolves chained refs across three artifacts", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "leaf.txt",
			artifact: { text: "payload" },
		});
		const leafUri = getArtifactUri({
			...base,
			filename: "leaf.txt",
			version: 0,
		});
		await service.saveArtifact({
			...base,
			filename: "mid.txt",
			artifact: {
				fileData: { fileUri: leafUri, mimeType: "text/plain" },
			},
		});
		const midUri = getArtifactUri({
			...base,
			filename: "mid.txt",
			version: 0,
		});
		await service.saveArtifact({
			...base,
			filename: "root.txt",
			artifact: {
				fileData: { fileUri: midUri, mimeType: "text/plain" },
			},
		});

		await expect(
			service.loadArtifact({ ...base, filename: "root.txt" }),
		).resolves.toEqual({ text: "payload" });
	});
});
