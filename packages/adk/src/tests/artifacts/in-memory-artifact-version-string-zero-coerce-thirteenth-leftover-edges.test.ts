import { describe, expect, it } from "vitest";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

/**
 * Thirteenth leftover: loadArtifact indexes with `versions[targetVersion]`.
 * Twelfth covers false/"" /true string-key miss. String `"0"` coerces to
 * index 0; `"00"` / `"0 "` pass the numeric range check then miss.
 */
describe("InMemoryArtifactService version string-0 vs 00 thirteenth leftover", () => {
	const base = {
		appName: "app",
		userId: "uid",
		sessionId: "sess",
	};

	async function seedTwo(service: InMemoryArtifactService) {
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
	}

	it('version "0" coerces to index 0 and loads v0', async () => {
		const service = new InMemoryArtifactService();
		await seedTwo(service);
		await expect(
			service.loadArtifact({
				...base,
				filename: "v.txt",
				version: "0" as any,
			}),
		).resolves.toEqual({ text: "v0" });
	});

	it('version "1" coerces to index 1 and loads v1', async () => {
		const service = new InMemoryArtifactService();
		await seedTwo(service);
		await expect(
			service.loadArtifact({
				...base,
				filename: "v.txt",
				version: "1" as any,
			}),
		).resolves.toEqual({ text: "v1" });
	});

	it.each([
		{ label: "00", version: "00" as any },
		{ label: "0 ", version: "0 " as any },
		{ label: " 0", version: " 0" as any },
	])("version $label passes range then string-key miss → null", async ({
		version,
	}) => {
		const service = new InMemoryArtifactService();
		await seedTwo(service);
		await expect(
			service.loadArtifact({ ...base, filename: "v.txt", version }),
		).resolves.toBeNull();
	});

	it("numeric 0 still loads v0 (control)", async () => {
		const service = new InMemoryArtifactService();
		await seedTwo(service);
		await expect(
			service.loadArtifact({ ...base, filename: "v.txt", version: 0 }),
		).resolves.toEqual({ text: "v0" });
	});
});
