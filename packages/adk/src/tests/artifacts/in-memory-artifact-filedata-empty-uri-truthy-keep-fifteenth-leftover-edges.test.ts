import { describe, expect, it } from "vitest";
import { isArtifactRef } from "../../artifacts/artifact-util";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

/**
 * Fifteenth leftover: empty-payload gate keeps when `fileData` object is
 * present even if `fileUri: ""` — `isArtifactRef` is false ("" does not
 * start with artifact://) but `!artifactEntry.fileData` is false so the
 * entry is returned. Sixth keeps `gs://` fileData; util pins isRef for "".
 */
describe("InMemoryArtifactService fileData empty-uri truthy keep fifteenth leftover", () => {
	const base = {
		appName: "app",
		userId: "uid",
		sessionId: "sess",
	};

	it('fileData with fileUri "" is not a ref but still kept on load', async () => {
		const service = new InMemoryArtifactService();
		const artifact = {
			fileData: { fileUri: "", mimeType: "text/plain" },
		};
		expect(isArtifactRef(artifact)).toBe(false);

		await service.saveArtifact({
			...base,
			filename: "empty-uri.txt",
			artifact,
		});
		await expect(
			service.loadArtifact({ ...base, filename: "empty-uri.txt" }),
		).resolves.toEqual(artifact);
	});

	it("empty text + empty fileUri fileData still kept via fileData presence", async () => {
		const service = new InMemoryArtifactService();
		const artifact = {
			text: "",
			fileData: { fileUri: "", mimeType: "application/octet-stream" },
		};
		await service.saveArtifact({
			...base,
			filename: "empty-both.txt",
			artifact,
		});
		await expect(
			service.loadArtifact({ ...base, filename: "empty-both.txt" }),
		).resolves.toEqual(artifact);
	});
});
