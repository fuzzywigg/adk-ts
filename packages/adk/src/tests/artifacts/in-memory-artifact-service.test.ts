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

	it("returns inlineData artifacts and no-ops delete for missing keys", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "blob.bin",
			artifact: {
				inlineData: { data: "AQID", mimeType: "application/octet-stream" },
			},
		});

		expect(
			await service.loadArtifact({ ...base, filename: "blob.bin" }),
		).toEqual({
			inlineData: { data: "AQID", mimeType: "application/octet-stream" },
		});

		await expect(
			service.deleteArtifact({ ...base, filename: "never-saved.txt" }),
		).resolves.toBeUndefined();
		expect(await service.listArtifactKeys(base)).toEqual(["blob.bin"]);
	});

	it("lists keys sorted and resolves user-scoped artifact URIs", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "z.txt",
			artifact: { text: "z" },
		});
		await service.saveArtifact({
			...base,
			filename: "a.txt",
			artifact: { text: "a" },
		});
		await service.saveArtifact({
			...base,
			filename: "user:prefs.json",
			artifact: { text: '{"theme":"dark"}' },
		});

		expect(await service.listArtifactKeys(base)).toEqual([
			"a.txt",
			"user:prefs.json",
			"z.txt",
		]);

		const uri = getArtifactUri({
			appName: base.appName,
			userId: base.userId,
			filename: "user:prefs.json",
			version: 0,
		});
		await service.saveArtifact({
			...base,
			filename: "prefs-alias.txt",
			artifact: {
				fileData: {
					fileUri: uri,
					mimeType: "application/json",
				},
			},
		});

		expect(
			await service.loadArtifact({ ...base, filename: "prefs-alias.txt" }),
		).toEqual({ text: '{"theme":"dark"}' });
	});
});
