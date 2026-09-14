import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	saveMock,
	getMetadataMock,
	downloadMock,
	deleteMock,
	getFilesMock,
	fileMock,
	bucketMock,
	StorageMock,
} = vi.hoisted(() => {
	const saveMock = vi.fn().mockResolvedValue(undefined);
	const getMetadataMock = vi.fn();
	const downloadMock = vi.fn();
	const deleteMock = vi.fn().mockResolvedValue(undefined);
	const getFilesMock = vi.fn();
	const fileMock = vi.fn(() => ({
		save: saveMock,
		getMetadata: getMetadataMock,
		download: downloadMock,
		delete: deleteMock,
	}));
	const bucketMock = vi.fn(() => ({
		file: fileMock,
		getFiles: getFilesMock,
	}));
	const StorageMock = vi.fn(function Storage(this: any) {
		this.bucket = bucketMock;
	});
	return {
		saveMock,
		getMetadataMock,
		downloadMock,
		deleteMock,
		getFilesMock,
		fileMock,
		bucketMock,
		StorageMock,
	};
});

vi.mock("@google-cloud/storage", () => ({
	Storage: StorageMock,
}));

import { GcsArtifactService } from "../../artifacts/gcs-artifact-service";

/**
 * Tenth leftover: `if (!artifactBuffer)` after download destructure.
 * Empty Buffer is truthy (kept); null/undefined/""/0 return null.
 */
describe("GcsArtifactService download buffer falsy tenth leftover", () => {
	const base = {
		appName: "app",
		userId: "uid",
		sessionId: "s1",
		filename: "note.txt",
		version: 0,
	};

	beforeEach(() => {
		vi.clearAllMocks();
		bucketMock.mockImplementation(() => ({
			file: fileMock,
			getFiles: getFilesMock,
		}));
		fileMock.mockImplementation(() => ({
			save: saveMock,
			getMetadata: getMetadataMock,
			download: downloadMock,
			delete: deleteMock,
		}));
		getMetadataMock.mockResolvedValue([{ contentType: "text/plain" }]);
	});

	it.each([
		{ label: "null", buffer: null },
		{ label: "undefined", buffer: undefined },
		{ label: "empty-string", buffer: "" },
		{ label: "zero", buffer: 0 },
		{ label: "false", buffer: false },
	] as const)("$label download payload returns null via !artifactBuffer", async ({
		buffer,
	}) => {
		downloadMock.mockResolvedValue([buffer]);
		const service = new GcsArtifactService("bucket");
		await expect(service.loadArtifact(base)).resolves.toBeNull();
	});

	it("empty download array destructures undefined → null", async () => {
		downloadMock.mockResolvedValue([]);
		const service = new GcsArtifactService("bucket");
		await expect(service.loadArtifact(base)).resolves.toBeNull();
	});

	it("empty Buffer is truthy so load returns empty-string payload", async () => {
		downloadMock.mockResolvedValue([Buffer.from("")]);
		const service = new GcsArtifactService("bucket");
		const part = await service.loadArtifact(base);
		expect(part?.inlineData?.data).toBe("");
		expect(part?.inlineData?.mimeType).toBe("text/plain");
	});

	it("missing contentType falls back to octet-stream even for empty Buffer", async () => {
		getMetadataMock.mockResolvedValue([{}]);
		downloadMock.mockResolvedValue([Buffer.alloc(0)]);
		const service = new GcsArtifactService("bucket");
		const part = await service.loadArtifact(base);
		expect(part?.inlineData?.mimeType).toBe("application/octet-stream");
	});

	it("non-404 errors still rethrow (distinct from falsy-buffer null)", async () => {
		getMetadataMock.mockRejectedValue(
			Object.assign(new Error("denied"), { code: 403 }),
		);
		const service = new GcsArtifactService("bucket");
		await expect(service.loadArtifact(base)).rejects.toThrow(/denied/);
	});
});
