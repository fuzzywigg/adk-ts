import { describe, expect, it } from "vitest";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

/**
 * Sixteenth leftover: loadArtifact version indexing — thirteenth pins numeric
 * string `"0"`/`"1"` hit; twelfth pins boolean `false` miss. String `"false"`
 * NaN-relational bounds pass (`"false" < 0` / `>= len` are false) but
 * `versions["false"]` is undefined → null. Asymmetry vs `"0"` hit.
 */
describe("InMemoryArtifactService version string-false index miss sixteenth leftover", () => {
	const base = {
		appName: "app",
		userId: "uid",
		sessionId: "sess",
	};

	async function seedThree(service: InMemoryArtifactService) {
		await service.saveArtifact({
			...base,
			filename: "v.txt",
			artifact: { text: "v0" },
		});
		await service.saveArtifact({
			...base,
			filename: "v.txt",
			artifact: { text: "v1" },
		});
		await service.saveArtifact({
			...base,
			filename: "v.txt",
			artifact: { text: "v2" },
		});
	}

	it('version "false" passes bounds then misses string key → null', async () => {
		const service = new InMemoryArtifactService();
		await seedThree(service);
		expect("false" < 0).toBe(false);
		expect(("false" as any) >= 3).toBe(false);
		await expect(
			service.loadArtifact({
				...base,
				filename: "v.txt",
				version: "false" as any,
			}),
		).resolves.toBeNull();
	});

	it('version "0" still hits index 0 (thirteenth control)', async () => {
		const service = new InMemoryArtifactService();
		await seedThree(service);
		await expect(
			service.loadArtifact({
				...base,
				filename: "v.txt",
				version: "0" as any,
			}),
		).resolves.toEqual({ text: "v0" });
	});

	it("boolean false still misses (twelfth control)", async () => {
		const service = new InMemoryArtifactService();
		await seedThree(service);
		await expect(
			service.loadArtifact({
				...base,
				filename: "v.txt",
				version: false as any,
			}),
		).resolves.toBeNull();
	});
});
