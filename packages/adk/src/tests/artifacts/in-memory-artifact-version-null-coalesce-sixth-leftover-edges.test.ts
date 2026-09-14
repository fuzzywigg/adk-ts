import { describe, expect, it } from "vitest";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

/**
 * Leftover: loadArtifact treats version === null like undefined (latest),
 * while version 0 is a concrete index. Negative wrap and OOB null remain.
 */
describe("InMemoryArtifactService sixth leftover: version null coalesce", () => {
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

	it("version null resolves to latest like undefined", async () => {
		const service = new InMemoryArtifactService();
		await seedThree(service);
		await expect(
			service.loadArtifact({
				...base,
				filename: "v.txt",
				version: null as any,
			}),
		).resolves.toEqual({ text: "v2" });
		await expect(
			service.loadArtifact({ ...base, filename: "v.txt" }),
		).resolves.toEqual({ text: "v2" });
	});

	it("version 0 is distinct from null/undefined latest", async () => {
		const service = new InMemoryArtifactService();
		await seedThree(service);
		await expect(
			service.loadArtifact({ ...base, filename: "v.txt", version: 0 }),
		).resolves.toEqual({ text: "v0" });
	});

	it("version undefined after explicit undefined arg still latest", async () => {
		const service = new InMemoryArtifactService();
		await seedThree(service);
		await expect(
			service.loadArtifact({
				...base,
				filename: "v.txt",
				version: undefined,
			}),
		).resolves.toEqual({ text: "v2" });
	});

	it("negative -1 wraps to last; -4 out of range null", async () => {
		const service = new InMemoryArtifactService();
		await seedThree(service);
		await expect(
			service.loadArtifact({ ...base, filename: "v.txt", version: -1 }),
		).resolves.toEqual({ text: "v2" });
		await expect(
			service.loadArtifact({ ...base, filename: "v.txt", version: -4 }),
		).resolves.toBeNull();
	});

	it("NaN version fails range check and returns null", async () => {
		const service = new InMemoryArtifactService();
		await seedThree(service);
		await expect(
			service.loadArtifact({
				...base,
				filename: "v.txt",
				version: Number.NaN,
			}),
		).resolves.toBeNull();
	});

	it("listVersions length matches save count independent of null load", async () => {
		const service = new InMemoryArtifactService();
		await seedThree(service);
		await expect(
			service.listVersions({ ...base, filename: "v.txt" }),
		).resolves.toEqual([0, 1, 2]);
	});
});
