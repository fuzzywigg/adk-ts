import { describe, expect, it } from "vitest";
import { getArtifactUri } from "../../artifacts/artifact-util";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

describe("InMemoryArtifactService", () => {
	const base = {
		appName: "app",
		userId: "user-1",
		sessionId: "session-1",
	};

	it("saves, loads, lists, and deletes session-scoped artifacts", async () => {
		const service = new InMemoryArtifactService();
		const artifact = { text: "hello" };

		const version = await service.saveArtifact({
			...base,
			filename: "note.txt",
			artifact,
		});
		expect(version).toBe(0);

		await service.saveArtifact({
			...base,
			filename: "note.txt",
			artifact: { text: "hello v2" },
		});

		expect(
			await service.loadArtifact({ ...base, filename: "note.txt" }),
		).toEqual({ text: "hello v2" });
		expect(
			await service.loadArtifact({
				...base,
				filename: "note.txt",
				version: 0,
			}),
		).toEqual({ text: "hello" });
		expect(
			await service.loadArtifact({
				...base,
				filename: "note.txt",
				version: -1,
			}),
		).toEqual({ text: "hello v2" });

		expect(
			await service.listVersions({ ...base, filename: "note.txt" }),
		).toEqual([0, 1]);
		expect(await service.listArtifactKeys(base)).toEqual(["note.txt"]);

		await service.deleteArtifact({ ...base, filename: "note.txt" });
		expect(
			await service.loadArtifact({ ...base, filename: "note.txt" }),
		).toBeNull();
		expect(
			await service.listVersions({ ...base, filename: "note.txt" }),
		).toEqual([]);
	});

	it("stores user-namespaced artifacts outside the session path", async () => {
		const service = new InMemoryArtifactService();

		await service.saveArtifact({
			...base,
			filename: "user:profile.json",
			artifact: { text: '{"name":"Ada"}' },
		});
		await service.saveArtifact({
			...base,
			sessionId: "other-session",
			filename: "session-only.txt",
			artifact: { text: "session" },
		});

		const keys = await service.listArtifactKeys(base);
		expect(keys).toContain("user:profile.json");
		expect(keys).not.toContain("session-only.txt");

		expect(
			await service.loadArtifact({
				...base,
				sessionId: "ignored-for-user-ns",
				filename: "user:profile.json",
			}),
		).toEqual({ text: '{"name":"Ada"}' });
	});

	it("resolves artifact references via URI", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "source.txt",
			artifact: { text: "payload" },
		});

		const uri = getArtifactUri({
			...base,
			filename: "source.txt",
			version: 0,
		});
		await service.saveArtifact({
			...base,
			filename: "alias.txt",
			artifact: {
				fileData: {
					fileUri: uri,
					mimeType: "text/plain",
				},
			},
		});

		expect(
			await service.loadArtifact({ ...base, filename: "alias.txt" }),
		).toEqual({ text: "payload" });
	});

	it("returns null for missing paths and empty content", async () => {
		const service = new InMemoryArtifactService();

		expect(
			await service.loadArtifact({ ...base, filename: "missing.txt" }),
		).toBeNull();

		await service.saveArtifact({
			...base,
			filename: "empty.txt",
			artifact: {},
		});
		expect(
			await service.loadArtifact({ ...base, filename: "empty.txt" }),
		).toBeNull();

		expect(
			await service.loadArtifact({
				...base,
				filename: "empty.txt",
				version: 99,
			}),
		).toBeNull();
	});

	it("throws on invalid artifact reference URIs", async () => {
		const service = new InMemoryArtifactService();
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

	it("deleteArtifact is a no-op for missing paths", async () => {
		const service = new InMemoryArtifactService();
		await expect(
			service.deleteArtifact({ ...base, filename: "ghost.txt" }),
		).resolves.toBeUndefined();
	});

	it("returns fileData-only artifacts and null for out-of-range negative versions", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "uri-only.txt",
			artifact: {
				fileData: {
					fileUri: "https://example.com/x",
					mimeType: "text/plain",
				},
			},
		});
		expect(
			await service.loadArtifact({ ...base, filename: "uri-only.txt" }),
		).toEqual({
			fileData: {
				fileUri: "https://example.com/x",
				mimeType: "text/plain",
			},
		});

		await service.saveArtifact({
			...base,
			filename: "versions.txt",
			artifact: { text: "only" },
		});
		expect(
			await service.loadArtifact({
				...base,
				filename: "versions.txt",
				version: -99,
			}),
		).toBeNull();
	});

	it("lists mixed session and user keys in sorted order", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "z.txt",
			artifact: { text: "z" },
		});
		await service.saveArtifact({
			...base,
			filename: "user:a.json",
			artifact: { text: "a" },
		});
		await service.saveArtifact({
			...base,
			filename: "m.txt",
			artifact: { text: "m" },
		});
		expect(await service.listArtifactKeys(base)).toEqual([
			"m.txt",
			"user:a.json",
			"z.txt",
		]);
	});

	it("resolves user-scoped URI refs using fallback sessionId", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "user:source.txt",
			artifact: { text: "payload" },
		});
		const uri = getArtifactUri({
			appName: base.appName,
			userId: base.userId,
			filename: "user:source.txt",
			version: 0,
		});
		await service.saveArtifact({
			...base,
			filename: "alias-user.txt",
			artifact: {
				fileData: {
					fileUri: uri,
					mimeType: "text/plain",
				},
			},
		});
		expect(
			await service.loadArtifact({ ...base, filename: "alias-user.txt" }),
		).toEqual({ text: "payload" });
	});
});
