import { describe, expect, it } from "vitest";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

describe("InMemoryArtifactService leftover edges", () => {
	const base = {
		appName: "app",
		userId: "user-1",
		sessionId: "sess-1",
	};

	it("getArtifactPath distinguishes user-namespaced filenames", () => {
		const service = new InMemoryArtifactService();
		expect((service as any).getArtifactPath("app", "u", "s", "file.txt")).toBe(
			"app/u/s/file.txt",
		);
		expect(
			(service as any).getArtifactPath("app", "u", "s", "user:file.txt"),
		).toBe("app/u/user/user:file.txt");
	});

	it("saveArtifact versions increment densely from zero", async () => {
		const service = new InMemoryArtifactService();
		const v0 = await service.saveArtifact({
			...base,
			filename: "a.txt",
			artifact: { text: "one" },
		});
		const v1 = await service.saveArtifact({
			...base,
			filename: "a.txt",
			artifact: { text: "two" },
		});
		expect(v0).toBe(0);
		expect(v1).toBe(1);
		await expect(
			service.listVersions({ ...base, filename: "a.txt" }),
		).resolves.toEqual([0, 1]);
	});

	it("loadArtifact negative index wraps from the end", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "a.txt",
			artifact: { text: "first" },
		});
		await service.saveArtifact({
			...base,
			filename: "a.txt",
			artifact: { text: "second" },
		});
		await expect(
			service.loadArtifact({ ...base, filename: "a.txt", version: -1 }),
		).resolves.toEqual({ text: "second" });
		await expect(
			service.loadArtifact({ ...base, filename: "a.txt", version: -2 }),
		).resolves.toEqual({ text: "first" });
		await expect(
			service.loadArtifact({ ...base, filename: "a.txt", version: -3 }),
		).resolves.toBeNull();
	});

	it("loadArtifact returns null for out-of-range positive versions", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "a.txt",
			artifact: { text: "only" },
		});
		await expect(
			service.loadArtifact({ ...base, filename: "a.txt", version: 5 }),
		).resolves.toBeNull();
	});

	it("listArtifactKeys sorts session and user filenames together", async () => {
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
			filename: "user:m.txt",
			artifact: { text: "m" },
		});
		await expect(service.listArtifactKeys(base)).resolves.toEqual([
			"a.txt",
			"user:m.txt",
			"z.txt",
		]);
	});

	it("deleteArtifact removes only the targeted path", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "keep.txt",
			artifact: { text: "keep" },
		});
		await service.saveArtifact({
			...base,
			filename: "drop.txt",
			artifact: { text: "drop" },
		});
		await service.deleteArtifact({ ...base, filename: "drop.txt" });
		await expect(
			service.loadArtifact({ ...base, filename: "drop.txt" }),
		).resolves.toBeNull();
		await expect(
			service.loadArtifact({ ...base, filename: "keep.txt" }),
		).resolves.toEqual({ text: "keep" });
	});

	it("returns null for empty inlineData data buffers", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "empty.bin",
			artifact: {
				inlineData: { data: "", mimeType: "application/octet-stream" },
			} as any,
		});
		await expect(
			service.loadArtifact({ ...base, filename: "empty.bin" }),
		).resolves.toBeNull();
	});

	it("keeps fileData-only artifacts even without text or inlineData", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "remote.txt",
			artifact: {
				fileData: {
					fileUri: "gs://bucket/obj",
					mimeType: "text/plain",
				},
			} as any,
		});
		await expect(
			service.loadArtifact({ ...base, filename: "remote.txt" }),
		).resolves.toEqual({
			fileData: {
				fileUri: "gs://bucket/obj",
				mimeType: "text/plain",
			},
		});
	});

	it("isolates the same filename across different sessions", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			sessionId: "sess-a",
			filename: "shared.txt",
			artifact: { text: "a" },
		});
		await service.saveArtifact({
			...base,
			sessionId: "sess-b",
			filename: "shared.txt",
			artifact: { text: "b" },
		});
		await expect(
			service.loadArtifact({
				...base,
				sessionId: "sess-a",
				filename: "shared.txt",
			}),
		).resolves.toEqual({ text: "a" });
		await expect(
			service.loadArtifact({
				...base,
				sessionId: "sess-b",
				filename: "shared.txt",
			}),
		).resolves.toEqual({ text: "b" });
	});

	it("listVersions is empty after deleteArtifact", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "gone.txt",
			artifact: { text: "x" },
		});
		await service.deleteArtifact({ ...base, filename: "gone.txt" });
		await expect(
			service.listVersions({ ...base, filename: "gone.txt" }),
		).resolves.toEqual([]);
	});
});
