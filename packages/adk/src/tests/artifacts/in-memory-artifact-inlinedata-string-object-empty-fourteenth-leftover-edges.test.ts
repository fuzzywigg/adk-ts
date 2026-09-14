import { describe, expect, it } from "vitest";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

/**
 * Fourteenth leftover: empty-payload gate uses `data.length === 0`.
 * `new String("")` is truthy but length 0 → null. Thirteenth pinned plain
 * object `{ nested }` kept and array `[]` → null.
 */
describe("InMemoryArtifactService inlineData String-object empty fourteenth leftover", () => {
	const base = {
		appName: "app",
		userId: "uid",
		sessionId: "sess",
	};

	it('new String("") data is truthy object with length 0 → null', async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "boxed-empty.bin",
			artifact: {
				inlineData: {
					data: new String("") as any,
					mimeType: "text/plain",
				},
			},
		});
		await expect(
			service.loadArtifact({ ...base, filename: "boxed-empty.bin" }),
		).resolves.toBeNull();
	});

	it('new String("hi") kept (length > 0)', async () => {
		const service = new InMemoryArtifactService();
		const artifact = {
			inlineData: {
				data: new String("hi") as any,
				mimeType: "text/plain",
			},
		};
		await service.saveArtifact({
			...base,
			filename: "boxed-hi.bin",
			artifact,
		});
		await expect(
			service.loadArtifact({ ...base, filename: "boxed-hi.bin" }),
		).resolves.toEqual(artifact);
	});

	it("plain object without length still kept (thirteenth control)", async () => {
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
});
