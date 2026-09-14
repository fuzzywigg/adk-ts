import { describe, expect, it } from "vitest";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

/**
 * Fourteenth leftover: `if (targetVersion < 0) { targetVersion =
 * versions.length + targetVersion }` — numeric -1 wraps. String `"-1"`
 * passes `< 0` (coerces) but `3 + "-1"` concatenates to `"3-1"` → miss → null.
 * Thirteenth pinned numeric-string `"0"`/`"1"` index hits.
 */
describe("InMemoryArtifactService version string-minus-one concat fourteenth leftover", () => {
	const base = {
		appName: "app",
		userId: "uid",
		sessionId: "sess",
	};

	it('version "-1" concatenates and returns null', async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "a.txt",
			artifact: { text: "v0" },
		});
		await service.saveArtifact({
			...base,
			filename: "a.txt",
			artifact: { text: "v1" },
		});
		await service.saveArtifact({
			...base,
			filename: "a.txt",
			artifact: { text: "v2" },
		});

		await expect(
			service.loadArtifact({
				...base,
				filename: "a.txt",
				version: "-1" as any,
			}),
		).resolves.toBeNull();
	});

	it("numeric -1 wraps to latest (control)", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "b.txt",
			artifact: { text: "v0" },
		});
		await service.saveArtifact({
			...base,
			filename: "b.txt",
			artifact: { text: "v1" },
		});
		await service.saveArtifact({
			...base,
			filename: "b.txt",
			artifact: { text: "v2" },
		});

		await expect(
			service.loadArtifact({
				...base,
				filename: "b.txt",
				version: -1,
			}),
		).resolves.toEqual({ text: "v2" });
	});

	it('version "0" still hits index 0 (thirteenth control)', async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "c.txt",
			artifact: { text: "first" },
		});
		await expect(
			service.loadArtifact({
				...base,
				filename: "c.txt",
				version: "0" as any,
			}),
		).resolves.toEqual({ text: "first" });
	});
});
