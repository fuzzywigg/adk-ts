import { describe, expect, it } from "vitest";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

/**
 * Thirteenth leftover: loadArtifact skips nullish coalesce for string versions.
 * Twelfth showed false/""/true miss via string-key lookup. Canonical numeric
 * strings ("0","1") coerce through `<`/`>=` AND map to real array indices, so
 * they load successfully — asymmetry vs boolean false.
 */
describe("InMemoryArtifactService version numeric-string index thirteenth leftover", () => {
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

	it('version "0" loads index 0 (unlike boolean false)', async () => {
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

	it('version "1" loads index 1', async () => {
		const service = new InMemoryArtifactService();
		await seedThree(service);
		await expect(
			service.loadArtifact({
				...base,
				filename: "v.txt",
				version: "1" as any,
			}),
		).resolves.toEqual({ text: "v1" });
	});

	it('version "2" loads latest via string index', async () => {
		const service = new InMemoryArtifactService();
		await seedThree(service);
		await expect(
			service.loadArtifact({
				...base,
				filename: "v.txt",
				version: "2" as any,
			}),
		).resolves.toEqual({ text: "v2" });
	});

	it('version "3" is out of range → null', async () => {
		const service = new InMemoryArtifactService();
		await seedThree(service);
		await expect(
			service.loadArtifact({
				...base,
				filename: "v.txt",
				version: "3" as any,
			}),
		).resolves.toBeNull();
	});

	it("boolean false still misses string key (twelfth control)", async () => {
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
