import { describe, expect, it } from "vitest";
import { isArtifactRef } from "../../artifacts/artifact-util";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

/**
 * Sixteenth leftover: empty-payload gate keeps when bare `fileData: {}` is
 * truthy — fifteenth keeps `fileUri: ""`; util pins `isArtifactRef({})`
 * false. Load path bare `{}` has no prior leftover.
 */
describe("InMemoryArtifactService fileData empty-object truthy keep sixteenth leftover", () => {
	const base = {
		appName: "app",
		userId: "uid",
		sessionId: "sess",
	};

	it("bare fileData {} is not a ref but still kept on load", async () => {
		const service = new InMemoryArtifactService();
		const artifact = { fileData: {} as any };
		expect(isArtifactRef(artifact)).toBe(false);

		await service.saveArtifact({
			...base,
			filename: "empty-obj.txt",
			artifact,
		});
		await expect(
			service.loadArtifact({ ...base, filename: "empty-obj.txt" }),
		).resolves.toEqual(artifact);
	});

	it("empty text + bare fileData {} still kept via fileData presence", async () => {
		const service = new InMemoryArtifactService();
		const artifact = {
			text: "",
			fileData: {} as any,
		};
		await service.saveArtifact({
			...base,
			filename: "empty-both-obj.txt",
			artifact,
		});
		await expect(
			service.loadArtifact({ ...base, filename: "empty-both-obj.txt" }),
		).resolves.toEqual(artifact);
	});

	it("no text/inlineData/fileData still returns null (control)", async () => {
		const service = new InMemoryArtifactService();
		const path = "app/uid/sess/empty-null.txt";
		(service as any).artifacts.set(path, [{ text: "" }]);
		await expect(
			service.loadArtifact({ ...base, filename: "empty-null.txt" }),
		).resolves.toBeNull();
	});
});
