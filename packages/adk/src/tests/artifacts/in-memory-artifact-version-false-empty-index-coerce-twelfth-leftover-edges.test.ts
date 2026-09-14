import { describe, expect, it } from "vitest";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

/**
 * Twelfth leftover: loadArtifact only nullish-coalesces undefined/null to
 * latest. `false` / `""` / `true` skip that arm; relational `<`/`>=` coerce
 * them to 0/0/1 so they pass the range check, then `versions[false]` looks up
 * the string key `"false"` (not index 0) and `!artifactEntry` returns null.
 */
describe("InMemoryArtifactService version false/empty coerce twelfth leftover", () => {
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

	it.each([
		{ label: "false", version: false as any },
		{ label: "empty string", version: "" as any },
		{ label: "true", version: true as any },
	])("version $label passes numeric range then misses string key → null", async ({
		version,
	}) => {
		const service = new InMemoryArtifactService();
		await seedThree(service);
		await expect(
			service.loadArtifact({ ...base, filename: "v.txt", version }),
		).resolves.toBeNull();
	});

	it("null still resolves to latest (sixth control)", async () => {
		const service = new InMemoryArtifactService();
		await seedThree(service);
		await expect(
			service.loadArtifact({
				...base,
				filename: "v.txt",
				version: null as any,
			}),
		).resolves.toEqual({ text: "v2" });
	});

	it("numeric 0 still loads v0 (control vs false)", async () => {
		const service = new InMemoryArtifactService();
		await seedThree(service);
		await expect(
			service.loadArtifact({ ...base, filename: "v.txt", version: 0 }),
		).resolves.toEqual({ text: "v0" });
	});
});
