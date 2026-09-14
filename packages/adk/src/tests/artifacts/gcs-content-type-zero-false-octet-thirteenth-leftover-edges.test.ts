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
 * Thirteenth leftover: `metadata.contentType || "application/octet-stream"`.
 * Fifth leftover pinned "" / null / undefined; 0 / false / NaN also falsy and
 * default, while whitespace stays.
 */
describe("GcsArtifactService contentType 0/false octet thirteenth leftover", () => {
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

	it.each([
		{ label: "0", contentType: 0 },
		{ label: "false", contentType: false },
		{ label: "NaN", contentType: Number.NaN },
	])("loadArtifact defaults octet-stream when contentType is $label", async ({
		contentType,
	}) => {
		getMetadataMock.mockResolvedValue([{ contentType: contentType as any }]);
		const service = new GcsArtifactService("bucket");
		const part = await service.loadArtifact({
			...base,
			filename: "note.txt",
			version: 0,
		});
		expect(part?.inlineData.mimeType).toBe("application/octet-stream");
	});

	it('keeps string "0" contentType (truthy control vs numeric 0)', async () => {
		getMetadataMock.mockResolvedValue([{ contentType: "0" }]);
		const service = new GcsArtifactService("bucket");
		const part = await service.loadArtifact({
			...base,
			filename: "note.txt",
			version: 0,
		});
		expect(part?.inlineData.mimeType).toBe("0");
	});

	it("keeps whitespace contentType (fifth control)", async () => {
		getMetadataMock.mockResolvedValue([{ contentType: "  " }]);
		const service = new GcsArtifactService("bucket");
		const part = await service.loadArtifact({
			...base,
			filename: "note.txt",
			version: 0,
		});
		expect(part?.inlineData.mimeType).toBe("  ");
	});
});
