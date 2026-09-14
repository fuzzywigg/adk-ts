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
 * Thirteenth leftover: `contentType || "application/octet-stream"` treats
 * numeric/boolean falsy like empty string. Fifth leftover covers ""/null
 * and keeps string `"0"`/`"false"`.
 */
describe("GcsArtifactService contentType numeric falsy thirteenth leftover", () => {
	const base = {
		appName: "app",
		userId: "user-1",
		sessionId: "sess-1",
		filename: "blob.bin",
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
		downloadMock.mockResolvedValue([Buffer.from("raw")]);
		getFilesMock.mockResolvedValue([
			[{ name: "app/user-1/sess-1/blob.bin/0" }],
		]);
	});

	it.each([
		{ label: "0", contentType: 0 },
		{ label: "false", contentType: false },
		{ label: "NaN", contentType: Number.NaN },
	])("$label contentType coalesces to application/octet-stream", async ({
		contentType,
	}) => {
		getMetadataMock.mockResolvedValue([{ contentType }]);
		const service = new GcsArtifactService("bucket");
		const part = await service.loadArtifact({ ...base, version: 0 });
		expect(part?.inlineData?.mimeType).toBe("application/octet-stream");
	});

	it('string "0" contentType still kept (fifth control)', async () => {
		getMetadataMock.mockResolvedValue([{ contentType: "0" }]);
		const service = new GcsArtifactService("bucket");
		const part = await service.loadArtifact({ ...base, version: 0 });
		expect(part?.inlineData?.mimeType).toBe("0");
	});
});
