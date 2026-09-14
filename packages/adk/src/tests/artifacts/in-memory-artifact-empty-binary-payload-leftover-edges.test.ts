import { describe, expect, it } from "vitest";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

describe("InMemoryArtifactService leftover: empty binary inlineData payloads", () => {
	const base = {
		appName: "app",
		userId: "user-1",
		sessionId: "session-1",
	};

	it("returns null for empty Uint8Array inlineData.data", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "empty-u8.bin",
			artifact: {
				inlineData: {
					data: new Uint8Array(0) as any,
					mimeType: "application/octet-stream",
				},
			},
		});
		await expect(
			service.loadArtifact({ ...base, filename: "empty-u8.bin" }),
		).resolves.toBeNull();
	});

	it("returns null for empty Buffer-like length-0 typed array", async () => {
		const service = new InMemoryArtifactService();
		const empty = new Uint8Array([]);
		await service.saveArtifact({
			...base,
			filename: "empty-typed.bin",
			artifact: {
				inlineData: {
					data: empty as any,
					mimeType: "application/octet-stream",
				},
			},
		});
		await expect(
			service.loadArtifact({ ...base, filename: "empty-typed.bin" }),
		).resolves.toBeNull();
	});

	it("keeps non-empty Uint8Array payload", async () => {
		const service = new InMemoryArtifactService();
		const payload = new Uint8Array([1, 2, 3]);
		await service.saveArtifact({
			...base,
			filename: "bytes.bin",
			artifact: {
				inlineData: {
					data: payload as any,
					mimeType: "application/octet-stream",
				},
			},
		});
		const loaded = await service.loadArtifact({
			...base,
			filename: "bytes.bin",
		});
		expect(loaded?.inlineData?.data).toEqual(payload);
	});

	it("empty string inlineData still null (baseline)", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "empty-str.txt",
			artifact: {
				inlineData: { data: "", mimeType: "text/plain" },
			},
		});
		await expect(
			service.loadArtifact({ ...base, filename: "empty-str.txt" }),
		).resolves.toBeNull();
	});

	it("empty text-only part is also null (falsy text)", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "text-only.txt",
			artifact: { text: "" },
		});
		await expect(
			service.loadArtifact({ ...base, filename: "text-only.txt" }),
		).resolves.toBeNull();
	});

	it("non-empty text survives even without inlineData", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "text-ok.txt",
			artifact: { text: "hi" },
		});
		await expect(
			service.loadArtifact({ ...base, filename: "text-ok.txt" }),
		).resolves.toEqual({ text: "hi" });
	});
});
