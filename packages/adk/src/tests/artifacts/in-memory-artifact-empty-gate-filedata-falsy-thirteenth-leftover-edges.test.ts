import { describe, expect, it } from "vitest";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

/**
 * Thirteenth leftover: empty-payload gate uses `!text` / `!data` / `!fileData`.
 * Sixth keeps string `"0"`; empty binary leftover nulls empty Uint8Array.
 * Missing: empty `fileData: {}` keep, numeric falsy text/data null, `data: {}`.
 */
describe("InMemoryArtifactService empty-gate fileData/text falsy thirteenth leftover", () => {
	const base = {
		appName: "app",
		userId: "uid",
		sessionId: "sess",
		filename: "gate.txt",
	};

	it("fileData: {} is truthy → artifact kept", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			artifact: { fileData: {} } as any,
		});
		await expect(service.loadArtifact(base)).resolves.toEqual({
			fileData: {},
		});
	});

	it.each([
		{ label: "text 0", artifact: { text: 0 as any } },
		{ label: "text false", artifact: { text: false as any } },
		{
			label: "inlineData.data 0",
			artifact: { inlineData: { data: 0 as any, mimeType: "text/plain" } },
		},
		{
			label: "inlineData.data false",
			artifact: { inlineData: { data: false as any, mimeType: "text/plain" } },
		},
	])("$label short-circuits empty gate → null", async ({ artifact }) => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({ ...base, artifact });
		await expect(service.loadArtifact(base)).resolves.toBeNull();
	});

	it("inlineData.data: {} has no length===0 → kept", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			artifact: {
				inlineData: { data: {} as any, mimeType: "application/json" },
			},
		});
		await expect(service.loadArtifact(base)).resolves.toMatchObject({
			inlineData: { data: {} },
		});
	});

	it('string text "0" still kept (sixth control)', async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			artifact: { text: "0" },
		});
		await expect(service.loadArtifact(base)).resolves.toEqual({ text: "0" });
	});
});
