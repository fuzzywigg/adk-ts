import { describe, expect, it } from "vitest";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

describe("InMemoryArtifactService sessionId=user / prefix collision ninth leftover", () => {
	it('sessionId === "user" shares path prefix with user-namespace → listing cross-contaminates', async () => {
		const service = new InMemoryArtifactService();
		const base = {
			appName: "app",
			userId: "uid",
			sessionId: "user",
		};

		await service.saveArtifact({
			...base,
			filename: "session-note.txt",
			artifact: { text: "s" },
		});
		await service.saveArtifact({
			...base,
			filename: "user:ns.txt",
			artifact: { text: "u" },
		});

		const keys = await service.listArtifactKeys(base);
		expect(keys).toEqual(["session-note.txt", "user:ns.txt"]);
		expect(
			(service as any).artifacts.has("app/uid/user/session-note.txt"),
		).toBe(true);
		expect((service as any).artifacts.has("app/uid/user/user:ns.txt")).toBe(
			true,
		);
	});

	it("trailing slash on sessionPrefix prevents sess vs sess-1 sibling bleed", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			appName: "app",
			userId: "uid",
			sessionId: "sess-1",
			filename: "sibling.txt",
			artifact: { text: "sib" },
		});
		await service.saveArtifact({
			appName: "app",
			userId: "uid",
			sessionId: "sess",
			filename: "own.txt",
			artifact: { text: "own" },
		});

		const keys = await service.listArtifactKeys({
			appName: "app",
			userId: "uid",
			sessionId: "sess",
		});
		expect(keys).toEqual(["own.txt"]);
		expect(keys).not.toContain("1/sibling.txt");
	});

	it("else-if prevents double-push even when sessionPrefix === userNamespacePrefix", async () => {
		const service = new InMemoryArtifactService();
		const base = {
			appName: "app",
			userId: "uid",
			sessionId: "user",
		};
		await service.saveArtifact({
			...base,
			filename: "only.txt",
			artifact: { text: "o" },
		});
		const keys = await service.listArtifactKeys(base);
		expect(keys.filter((k) => k === "only.txt")).toHaveLength(1);
	});

	it("userId prefix collision does not apply — only session path uses startsWith on sessionId segment", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			appName: "app",
			userId: "user-extra",
			sessionId: "s1",
			filename: "other.txt",
			artifact: { text: "o" },
		});
		const keys = await service.listArtifactKeys({
			appName: "app",
			userId: "user",
			sessionId: "s1",
		});
		expect(keys).toEqual([]);
	});

	it("sparse undefined hole in versions returns null (distinct from OOB)", async () => {
		const service = new InMemoryArtifactService();
		const path = "app/uid/s1/hole.txt";
		(service as any).artifacts.set(path, [
			{ text: "v0" },
			undefined,
			{ text: "v2" },
		]);
		await expect(
			service.loadArtifact({
				appName: "app",
				userId: "uid",
				sessionId: "s1",
				filename: "hole.txt",
				version: 1,
			}),
		).resolves.toBeNull();
		await expect(
			service.loadArtifact({
				appName: "app",
				userId: "uid",
				sessionId: "s1",
				filename: "hole.txt",
				version: 2,
			}),
		).resolves.toEqual({ text: "v2" });
	});

	it("listVersions still reports dense 0..n-1 even when map has holes", async () => {
		const service = new InMemoryArtifactService();
		const path = "app/uid/s1/dense.txt";
		(service as any).artifacts.set(path, [
			{ text: "a" },
			undefined,
			{ text: "c" },
		]);
		await expect(
			service.listVersions({
				appName: "app",
				userId: "uid",
				sessionId: "s1",
				filename: "dense.txt",
			}),
		).resolves.toEqual([0, 1, 2]);
	});

	it.each([
		{ artifact: { text: "0" }, kept: true },
		{ artifact: { text: "" }, kept: false },
		{ artifact: { text: " " }, kept: true },
		{
			artifact: { inlineData: { data: "x", mimeType: "text/plain" } },
			kept: true,
		},
		{
			artifact: { inlineData: { data: "", mimeType: "text/plain" } },
			kept: false,
		},
		{
			artifact: { fileData: { fileUri: "gs://x", mimeType: "text/plain" } },
			kept: true,
		},
	])("empty-content null filter for $artifact → kept=$kept", async ({
		artifact,
		kept,
	}) => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			appName: "app",
			userId: "uid",
			sessionId: "s1",
			filename: "f.txt",
			artifact: artifact as any,
		});
		const loaded = await service.loadArtifact({
			appName: "app",
			userId: "uid",
			sessionId: "s1",
			filename: "f.txt",
		});
		if (kept) {
			expect(loaded).toEqual(artifact);
		} else {
			expect(loaded).toBeNull();
		}
	});

	it("negative version wraps on InMemory (asymmetry vs GCS literal -1 path)", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			appName: "app",
			userId: "uid",
			sessionId: "s1",
			filename: "n.txt",
			artifact: { text: "v0" },
		});
		await service.saveArtifact({
			appName: "app",
			userId: "uid",
			sessionId: "s1",
			filename: "n.txt",
			artifact: { text: "v1" },
		});
		await expect(
			service.loadArtifact({
				appName: "app",
				userId: "uid",
				sessionId: "s1",
				filename: "n.txt",
				version: -1,
			}),
		).resolves.toEqual({ text: "v1" });
		await expect(
			service.loadArtifact({
				appName: "app",
				userId: "uid",
				sessionId: "s1",
				filename: "n.txt",
				version: -2,
			}),
		).resolves.toEqual({ text: "v0" });
	});
});
