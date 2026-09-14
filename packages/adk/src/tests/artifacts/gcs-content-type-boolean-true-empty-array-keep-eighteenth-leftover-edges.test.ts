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
 * Eighteenth leftover: `metadata.contentType || "application/octet-stream"`.
 * Sixteenth keeps string `"false"`; thirteenth defaults boolean false.
 * Boolean `true` / empty array `[]` / string `"true"` are truthy and kept.
 */
describe("GcsArtifactService contentType boolean-true / empty-array keep eighteenth leftover", () => {
	const base = {
		appName: "app",
		userId: "user-1",
		sessionId: "sess-1",
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
		downloadMock.mockResolvedValue([Buffer.from("blob")]);
	});

	it("keeps boolean true contentType", async () => {
		getMetadataMock.mockResolvedValue([{ contentType: true as any }]);
		const service = new GcsArtifactService("bucket");
		const part = await service.loadArtifact({
			...base,
			filename: "note.txt",
			version: 0,
		});
		expect(part?.inlineData.mimeType).toBe(true);
	});

	it("keeps empty-array contentType", async () => {
		getMetadataMock.mockResolvedValue([{ contentType: [] as any }]);
		const service = new GcsArtifactService("bucket");
		const part = await service.loadArtifact({
			...base,
			filename: "note.txt",
			version: 0,
		});
		expect(part?.inlineData.mimeType).toEqual([]);
	});

	it('keeps string "true" contentType', async () => {
		getMetadataMock.mockResolvedValue([{ contentType: "true" }]);
		const service = new GcsArtifactService("bucket");
		const part = await service.loadArtifact({
			...base,
			filename: "note.txt",
			version: 0,
		});
		expect(part?.inlineData.mimeType).toBe("true");
	});

	it('string "false" still kept (sixteenth control)', async () => {
		getMetadataMock.mockResolvedValue([{ contentType: "false" }]);
		const service = new GcsArtifactService("bucket");
		const part = await service.loadArtifact({
			...base,
			filename: "note.txt",
			version: 0,
		});
		expect(part?.inlineData.mimeType).toBe("false");
	});
});
