import { describe, expect, it } from "vitest";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

/**
 * Leftover matrix: listVersions / deleteArtifact / load sparse holes.
 * versions array holes (undefined entries) return null on load; delete is idempotent.
 */
describe("InMemoryArtifactService sixth leftover: listVersions / delete / holes", () => {
	const base = {
		appName: "app",
		userId: "uid",
		sessionId: "sess",
	};

	it("listVersions returns [] for unknown filename", async () => {
		const service = new InMemoryArtifactService();
		await expect(
			service.listVersions({ ...base, filename: "missing.txt" }),
		).resolves.toEqual([]);
	});

	it("listVersions returns [] after delete", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "x.txt",
			artifact: { text: "x" },
		});
		await service.deleteArtifact({ ...base, filename: "x.txt" });
		await expect(
			service.listVersions({ ...base, filename: "x.txt" }),
		).resolves.toEqual([]);
	});

	it("deleteArtifact is idempotent for missing path", async () => {
		const service = new InMemoryArtifactService();
		await expect(
			service.deleteArtifact({ ...base, filename: "ghost.txt" }),
		).resolves.toBeUndefined();
		await expect(
			service.deleteArtifact({ ...base, filename: "ghost.txt" }),
		).resolves.toBeUndefined();
	});

	it("sparse hole at index returns null on load", async () => {
		const service = new InMemoryArtifactService();
		const path = "app/uid/sess/hole.txt";
		(service as any).artifacts.set(path, [
			{ text: "v0" },
			undefined,
			{ text: "v2" },
		]);
		await expect(
			service.loadArtifact({ ...base, filename: "hole.txt", version: 1 }),
		).resolves.toBeNull();
		await expect(
			service.loadArtifact({ ...base, filename: "hole.txt", version: 0 }),
		).resolves.toEqual({ text: "v0" });
		await expect(
			service.loadArtifact({ ...base, filename: "hole.txt", version: 2 }),
		).resolves.toEqual({ text: "v2" });
	});

	it("listVersions length includes holes", async () => {
		const service = new InMemoryArtifactService();
		const path = "app/uid/sess/hole2.txt";
		(service as any).artifacts.set(path, [
			{ text: "a" },
			undefined,
			{ text: "c" },
		]);
		await expect(
			service.listVersions({ ...base, filename: "hole2.txt" }),
		).resolves.toEqual([0, 1, 2]);
	});

	it("empty versions array stored returns null load and [] listVersions", async () => {
		const service = new InMemoryArtifactService();
		(service as any).artifacts.set("app/uid/sess/empty.txt", []);
		await expect(
			service.loadArtifact({ ...base, filename: "empty.txt" }),
		).resolves.toBeNull();
		await expect(
			service.listVersions({ ...base, filename: "empty.txt" }),
		).resolves.toEqual([]);
	});

	it("cross-session isolation for same filename", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			sessionId: "s1",
			filename: "f.txt",
			artifact: { text: "one" },
		});
		await service.saveArtifact({
			...base,
			sessionId: "s2",
			filename: "f.txt",
			artifact: { text: "two" },
		});
		await expect(
			service.loadArtifact({
				...base,
				sessionId: "s1",
				filename: "f.txt",
			}),
		).resolves.toEqual({ text: "one" });
		await expect(
			service.loadArtifact({
				...base,
				sessionId: "s2",
				filename: "f.txt",
			}),
		).resolves.toEqual({ text: "two" });
	});
});
