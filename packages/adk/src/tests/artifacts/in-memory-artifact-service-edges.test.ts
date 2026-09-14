import { describe, expect, it, vi } from "vitest";
import { getArtifactUri } from "../../artifacts/artifact-util";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

describe("InMemoryArtifactService leftover edges", () => {
	const base = {
		appName: "app",
		userId: "user-1",
		sessionId: "session-1",
	};

	it("circular artifact refs overflow the call stack", async () => {
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

	it("ref to a missing target version returns null", async () => {
		const service = new InMemoryArtifactService();
		const uri = getArtifactUri({
			...base,
			filename: "target.txt",
			version: 5,
		});
		await service.saveArtifact({
			...base,
			filename: "ref.txt",
			artifact: {
				fileData: { fileUri: uri, mimeType: "text/plain" },
			},
		});
		await service.saveArtifact({
			...base,
			filename: "target.txt",
			artifact: { text: "only-v0" },
		});

		await expect(
			service.loadArtifact({ ...base, filename: "ref.txt" }),
		).resolves.toBeNull();
	});

	it("user-scoped ref falls back to caller sessionId when URI has none", async () => {
		const service = new InMemoryArtifactService();
		const userUri = getArtifactUri({
			appName: base.appName,
			userId: base.userId,
			filename: "user:profile.json",
			version: 0,
		});
		expect(userUri).not.toContain("/sessions/");

		await service.saveArtifact({
			...base,
			filename: "user:profile.json",
			artifact: { text: '{"ok":true}' },
		});
		await service.saveArtifact({
			...base,
			filename: "pointer.txt",
			artifact: {
				fileData: { fileUri: userUri, mimeType: "application/json" },
			},
		});

		await expect(
			service.loadArtifact({ ...base, filename: "pointer.txt" }),
		).resolves.toEqual({ text: '{"ok":true}' });
	});

	it("saves and loads empty filename artifacts", async () => {
		const service = new InMemoryArtifactService();
		const version = await service.saveArtifact({
			...base,
			filename: "",
			artifact: { text: "empty-name" },
		});
		expect(version).toBe(0);
		expect(await service.loadArtifact({ ...base, filename: "" })).toEqual({
			text: "empty-name",
		});
		expect(await service.listArtifactKeys(base)).toContain("");
	});

	it("user: filenames with extra colons stay user-namespaced", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "user:ns:deep.json",
			artifact: { text: "deep" },
		});
		const keys = await service.listArtifactKeys({
			...base,
			sessionId: "other",
		});
		expect(keys).toContain("user:ns:deep.json");
		expect(
			await service.loadArtifact({
				...base,
				sessionId: "other",
				filename: "user:ns:deep.json",
			}),
		).toEqual({ text: "deep" });
	});

	it("returns null for empty inlineData without text or fileData", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "blank.bin",
			artifact: {
				inlineData: { data: "", mimeType: "application/octet-stream" },
			},
		});
		expect(
			await service.loadArtifact({ ...base, filename: "blank.bin" }),
		).toBeNull();
	});

	it("returns fileData-only artifacts that are not refs", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "remote.bin",
			artifact: {
				fileData: {
					fileUri: "gs://bucket/object",
					mimeType: "application/octet-stream",
				},
			},
		});
		expect(
			await service.loadArtifact({ ...base, filename: "remote.bin" }),
		).toEqual({
			fileData: {
				fileUri: "gs://bucket/object",
				mimeType: "application/octet-stream",
			},
		});
	});

	it("negative versions beyond length return null", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "short.txt",
			artifact: { text: "only" },
		});
		expect(
			await service.loadArtifact({
				...base,
				filename: "short.txt",
				version: -5,
			}),
		).toBeNull();
	});

	it("deleteArtifact is idempotent for missing keys", async () => {
		const service = new InMemoryArtifactService();
		await expect(
			service.deleteArtifact({ ...base, filename: "ghost.txt" }),
		).resolves.toBeUndefined();
	});

	it("listArtifactKeys sorts session and user keys together", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "zeta.txt",
			artifact: { text: "z" },
		});
		await service.saveArtifact({
			...base,
			filename: "user:alpha.json",
			artifact: { text: "a" },
		});
		await service.saveArtifact({
			...base,
			filename: "beta.txt",
			artifact: { text: "b" },
		});
		expect(await service.listArtifactKeys(base)).toEqual([
			"beta.txt",
			"user:alpha.json",
			"zeta.txt",
		]);
	});

	it("chained refs resolve through intermediate versions", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "leaf.txt",
			artifact: { text: "leaf" },
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
			filename: "top.txt",
			artifact: {
				fileData: { fileUri: midUri, mimeType: "text/plain" },
			},
		});

		expect(
			await service.loadArtifact({ ...base, filename: "top.txt" }),
		).toEqual({ text: "leaf" });
	});

	it("version null uses latest like undefined", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "n.txt",
			artifact: { text: "v0" },
		});
		await service.saveArtifact({
			...base,
			filename: "n.txt",
			artifact: { text: "v1" },
		});
		expect(
			await service.loadArtifact({
				...base,
				filename: "n.txt",
				version: null as unknown as undefined,
			}),
		).toEqual({ text: "v1" });
	});

	it("does not leak artifacts across sessions for non-user filenames", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "private.txt",
			artifact: { text: "s1" },
		});
		expect(
			await service.loadArtifact({
				...base,
				sessionId: "session-2",
				filename: "private.txt",
			}),
		).toBeNull();
		expect(
			await service.listArtifactKeys({
				...base,
				sessionId: "session-2",
			}),
		).toEqual([]);
	});
});

describe("InMemoryArtifactService path helpers via behavior", () => {
	it("save then listVersions grows monotonically", async () => {
		const service = new InMemoryArtifactService();
		const base = {
			appName: "app",
			userId: "u",
			sessionId: "s",
			filename: "grow.bin",
		};
		for (let i = 0; i < 5; i++) {
			expect(
				await service.saveArtifact({
					...base,
					artifact: { text: `v${i}` },
				}),
			).toBe(i);
		}
		expect(await service.listVersions(base)).toEqual([0, 1, 2, 3, 4]);
	});

	it("spies are not required for concurrent saves on different keys", async () => {
		const service = new InMemoryArtifactService();
		const base = { appName: "app", userId: "u", sessionId: "s" };
		await Promise.all(
			["a.txt", "b.txt", "c.txt"].map((filename) =>
				service.saveArtifact({
					...base,
					filename,
					artifact: { text: filename },
				}),
			),
		);
		expect(await service.listArtifactKeys(base)).toEqual([
			"a.txt",
			"b.txt",
			"c.txt",
		]);
	});

	it("load after delete of intermediate ref target returns null", async () => {
		const service = new InMemoryArtifactService();
		const base = {
			appName: "app",
			userId: "u",
			sessionId: "s",
		};
		await service.saveArtifact({
			...base,
			filename: "target.txt",
			artifact: { text: "data" },
		});
		const uri = getArtifactUri({
			...base,
			filename: "target.txt",
			version: 0,
		});
		await service.saveArtifact({
			...base,
			filename: "ref.txt",
			artifact: {
				fileData: { fileUri: uri, mimeType: "text/plain" },
			},
		});
		await service.deleteArtifact({ ...base, filename: "target.txt" });
		await expect(
			service.loadArtifact({ ...base, filename: "ref.txt" }),
		).resolves.toBeNull();
	});

	it("self-referential artifact ref overflows", async () => {
		const service = new InMemoryArtifactService();
		const base = {
			appName: "app",
			userId: "u",
			sessionId: "s",
		};
		const uri = getArtifactUri({
			...base,
			filename: "loop.txt",
			version: 0,
		});
		await service.saveArtifact({
			...base,
			filename: "loop.txt",
			artifact: {
				fileData: { fileUri: uri, mimeType: "text/plain" },
			},
		});
		await expect(
			service.loadArtifact({ ...base, filename: "loop.txt" }),
		).rejects.toThrow();
	});

	it("invalid artifact URI still throws with the raw uri in the message", async () => {
		const service = new InMemoryArtifactService();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		await service.saveArtifact({
			appName: "app",
			userId: "u",
			sessionId: "s",
			filename: "bad.txt",
			artifact: {
				fileData: {
					fileUri: "artifact://not-a-valid-shape",
					mimeType: "text/plain",
				},
			},
		});
		await expect(
			service.loadArtifact({
				appName: "app",
				userId: "u",
				sessionId: "s",
				filename: "bad.txt",
			}),
		).rejects.toThrow(/artifact:\/\/not-a-valid-shape/);
		warn.mockRestore();
	});
});
