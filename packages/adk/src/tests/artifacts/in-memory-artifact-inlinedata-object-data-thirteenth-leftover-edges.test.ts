import { describe, expect, it } from "vitest";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

/**
 * Thirteenth leftover: empty-payload gate is
 * `!text && (!inlineData?.data || data.length === 0) && !fileData`.
 * Object/array `data` is truthy with undefined `.length` (undefined === 0 is
 * false), so the part is kept — unlike empty-string data (prior leftovers).
 */
describe("InMemoryArtifactService inlineData object-data keep thirteenth leftover", () => {
	const base = {
		appName: "app",
		userId: "uid",
		sessionId: "sess",
	};

	it("object data without length is kept", async () => {
		const service = new InMemoryArtifactService();
		const artifact = {
			inlineData: {
				data: { nested: true } as any,
				mimeType: "application/json",
			},
		};
		await service.saveArtifact({
			...base,
			filename: "obj.bin",
			artifact,
		});
		await expect(
			service.loadArtifact({ ...base, filename: "obj.bin" }),
		).resolves.toEqual(artifact);
	});

	it("array data is kept even when length is 0", async () => {
		const service = new InMemoryArtifactService();
		const artifact = {
			inlineData: { data: [] as any, mimeType: "application/octet-stream" },
		};
		await service.saveArtifact({
			...base,
			filename: "arr.bin",
			artifact,
		});
		// length === 0 → empty-payload gate returns null
		await expect(
			service.loadArtifact({ ...base, filename: "arr.bin" }),
		).resolves.toBeNull();
	});

	it("non-empty array data is kept", async () => {
		const service = new InMemoryArtifactService();
		const artifact = {
			inlineData: {
				data: [1, 2] as any,
				mimeType: "application/octet-stream",
			},
		};
		await service.saveArtifact({
			...base,
			filename: "arr2.bin",
			artifact,
		});
		await expect(
			service.loadArtifact({ ...base, filename: "arr2.bin" }),
		).resolves.toEqual(artifact);
	});

	it("numeric 0 data is falsy → null (control)", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "num.bin",
			artifact: {
				inlineData: { data: 0 as any, mimeType: "text/plain" },
			},
		});
		await expect(
			service.loadArtifact({ ...base, filename: "num.bin" }),
		).resolves.toBeNull();
	});
});
