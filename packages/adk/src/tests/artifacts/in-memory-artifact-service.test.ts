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

	it("treats empty text as empty content and returns null", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "blank-text.txt",
			artifact: { text: "" },
		});
		expect(
			await service.loadArtifact({ ...base, filename: "blank-text.txt" }),
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

	it("treats null version as latest and supports negative indexing", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "idx.txt",
			artifact: { text: "v0" },
		});
		await service.saveArtifact({
			...base,
			filename: "idx.txt",
			artifact: { text: "v1" },
		});
		await service.saveArtifact({
			...base,
			filename: "idx.txt",
			artifact: { text: "v2" },
		});

		expect(
			await service.loadArtifact({
				...base,
				filename: "idx.txt",
				version: null as unknown as undefined,
			}),
		).toEqual({ text: "v2" });
		expect(
			await service.loadArtifact({
				...base,
				filename: "idx.txt",
				version: -2,
			}),
		).toEqual({ text: "v1" });
		expect(
			await service.loadArtifact({
				...base,
				filename: "idx.txt",
				version: -3,
			}),
		).toEqual({ text: "v0" });
	});

	it("returns inlineData artifacts and null for empty inlineData payloads", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "bin.bin",
			artifact: {
				inlineData: { data: "AQID", mimeType: "application/octet-stream" },
			},
		});
		expect(
			await service.loadArtifact({ ...base, filename: "bin.bin" }),
		).toEqual({
			inlineData: { data: "AQID", mimeType: "application/octet-stream" },
		});

		await service.saveArtifact({
			...base,
			filename: "empty-inline.txt",
			artifact: {
				inlineData: { data: "", mimeType: "text/plain" },
			},
		});
		expect(
			await service.loadArtifact({ ...base, filename: "empty-inline.txt" }),
		).toBeNull();
	});

	it("follows chained artifact references to the concrete payload", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "root.txt",
			artifact: { text: "deep" },
		});
		const rootUri = getArtifactUri({
			...base,
			filename: "root.txt",
			version: 0,
		});
		await service.saveArtifact({
			...base,
			filename: "mid.txt",
			artifact: {
				fileData: { fileUri: rootUri, mimeType: "text/plain" },
			},
		});
		const midUri = getArtifactUri({
			...base,
			filename: "mid.txt",
			version: 0,
		});
		await service.saveArtifact({
			...base,
			filename: "leaf.txt",
			artifact: {
				fileData: { fileUri: midUri, mimeType: "text/plain" },
			},
		});

		expect(
			await service.loadArtifact({ ...base, filename: "leaf.txt" }),
		).toEqual({ text: "deep" });
	});

	it("deletes user-namespaced artifacts without touching session keys", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "user:shared.txt",
			artifact: { text: "shared" },
		});
		await service.saveArtifact({
			...base,
			filename: "local.txt",
			artifact: { text: "local" },
		});

		await service.deleteArtifact({
			...base,
			filename: "user:shared.txt",
		});

		expect(
			await service.loadArtifact({ ...base, filename: "user:shared.txt" }),
		).toBeNull();
		expect(
			await service.loadArtifact({ ...base, filename: "local.txt" }),
		).toEqual({ text: "local" });
		expect(await service.listArtifactKeys(base)).toEqual(["local.txt"]);
	});

	it("listVersions is empty for missing keys and grows with saves", async () => {
		const service = new InMemoryArtifactService();
		expect(
			await service.listVersions({ ...base, filename: "missing.txt" }),
		).toEqual([]);

		expect(
			await service.saveArtifact({
				...base,
				filename: "grow.txt",
				artifact: { text: "a" },
			}),
		).toBe(0);
		expect(
			await service.saveArtifact({
				...base,
				filename: "grow.txt",
				artifact: { text: "b" },
			}),
		).toBe(1);
		expect(
			await service.saveArtifact({
				...base,
				filename: "grow.txt",
				artifact: { text: "c" },
			}),
		).toBe(2);
		expect(
			await service.listVersions({ ...base, filename: "grow.txt" }),
		).toEqual([0, 1, 2]);
	});

	it("isolates artifacts across apps and users", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "note.txt",
			artifact: { text: "app-user" },
		});
		await service.saveArtifact({
			appName: "other-app",
			userId: base.userId,
			sessionId: base.sessionId,
			filename: "note.txt",
			artifact: { text: "other-app" },
		});
		await service.saveArtifact({
			appName: base.appName,
			userId: "other-user",
			sessionId: base.sessionId,
			filename: "note.txt",
			artifact: { text: "other-user" },
		});

		expect(
			await service.loadArtifact({ ...base, filename: "note.txt" }),
		).toEqual({ text: "app-user" });
		expect(
			await service.loadArtifact({
				appName: "other-app",
				userId: base.userId,
				sessionId: base.sessionId,
				filename: "note.txt",
			}),
		).toEqual({ text: "other-app" });
		expect(await service.listArtifactKeys(base)).toEqual(["note.txt"]);
	});

	it("throws when a ref URI is present but fileData.fileUri is missing", async () => {
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

	it("keeps text artifacts even when other fields are empty-ish", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "text-wins.txt",
			artifact: {
				text: "keep me",
				inlineData: { data: "", mimeType: "text/plain" },
			},
		});
		expect(
			await service.loadArtifact({ ...base, filename: "text-wins.txt" }),
		).toEqual({
			text: "keep me",
			inlineData: { data: "", mimeType: "text/plain" },
		});
	});

	it("returns null when a stored version slot is undefined", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "hole.txt",
			artifact: { text: "v0" },
		});
		const artifactsMap = (service as any).artifacts as Map<string, unknown[]>;
		expect(artifactsMap.size).toBe(1);
		const [path, versions] = Array.from(artifactsMap.entries())[0];
		expect(path).toContain("hole.txt");
		versions[0] = undefined;
		expect(
			await service.loadArtifact({ ...base, filename: "hole.txt", version: 0 }),
		).toBeNull();
	});

	it("listVersions returns dense indices even after sparse saves", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "dense.txt",
			artifact: { text: "a" },
		});
		await service.saveArtifact({
			...base,
			filename: "dense.txt",
			artifact: { text: "b" },
		});
		await service.saveArtifact({
			...base,
			filename: "dense.txt",
			artifact: { text: "c" },
		});
		expect(
			await service.listVersions({ ...base, filename: "dense.txt" }),
		).toEqual([0, 1, 2]);
	});
});
