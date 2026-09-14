import { describe, expect, it } from "vitest";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

/**
 * Eighteenth leftover: loadArtifact version indexing — sixteenth pins string
 * `"false"` miss; thirteenth pins string `"0"` hit. Empty array `[]`
 * relationally coerces to 0 and passes bounds, but `versions[""]` misses.
 * Singleton `[0]` likewise coerces relationally to 0, yet `String([0])`
 * is `"0"` so `versions["0"]` hits index 0.
 */
describe("InMemoryArtifactService version empty-array vs singleton-index eighteenth leftover", () => {
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

	it("version [] passes bounds then misses empty-string key → null", async () => {
		const service = new InMemoryArtifactService();
		await seedThree(service);
		expect(([] as any) < 0).toBe(false);
		expect(([] as any) >= 3).toBe(false);
		expect(String([])).toBe("");
		await expect(
			service.loadArtifact({
				...base,
				filename: "v.txt",
				version: [] as any,
			}),
		).resolves.toBeNull();
	});

	it("version [0] hits via String([0]) === '0'", async () => {
		const service = new InMemoryArtifactService();
		await seedThree(service);
		expect(String([0])).toBe("0");
		await expect(
			service.loadArtifact({
				...base,
				filename: "v.txt",
				version: [0] as any,
			}),
		).resolves.toEqual({ text: "v0" });
	});

	it("version [1] hits index 1", async () => {
		const service = new InMemoryArtifactService();
		await seedThree(service);
		await expect(
			service.loadArtifact({
				...base,
				filename: "v.txt",
				version: [1] as any,
			}),
		).resolves.toEqual({ text: "v1" });
	});

	it("version {} misses object-string key → null", async () => {
		const service = new InMemoryArtifactService();
		await seedThree(service);
		await expect(
			service.loadArtifact({
				...base,
				filename: "v.txt",
				version: {} as any,
			}),
		).resolves.toBeNull();
	});

	it('version "0" still hits (thirteenth control)', async () => {
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
});
