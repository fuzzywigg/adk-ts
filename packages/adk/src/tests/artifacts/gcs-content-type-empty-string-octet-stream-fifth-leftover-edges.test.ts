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

describe("GcsArtifactService contentType || octet-stream fifth leftover", () => {
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
		downloadMock.mockResolvedValue([Buffer.from("raw")]);
	});

	it.each([
		{ label: "empty-string", contentType: "" },
		{ label: "null", contentType: null },
		{ label: "undefined", contentType: undefined },
		{ label: "missing-key", contentType: undefined, omit: true },
	])("$label contentType coalesces to application/octet-stream", async ({
		contentType,
		omit,
	}) => {
		getMetadataMock.mockResolvedValue([omit ? {} : { contentType }]);
		const service = new GcsArtifactService("bucket");
		const part = await service.loadArtifact({
			...base,
			filename: "note.bin",
			version: 0,
		});
		expect(part?.inlineData.mimeType).toBe("application/octet-stream");
	});

	it.each([
		"text/plain",
		"application/json",
		"0",
		" ",
		"false",
	])("truthy contentType %j is kept", async (contentType) => {
		getMetadataMock.mockResolvedValue([{ contentType }]);
		const service = new GcsArtifactService("bucket");
		const part = await service.loadArtifact({
			...base,
			filename: "note.bin",
			version: 0,
		});
		expect(part?.inlineData.mimeType).toBe(contentType);
	});

	it("falsy empty contentType differs from missing-only prior coverage", async () => {
		getMetadataMock.mockResolvedValue([{ contentType: "" }]);
		const service = new GcsArtifactService("bucket");
		const part = await service.loadArtifact({
			...base,
			filename: "empty-ct.bin",
			version: 0,
		});
		expect(part?.inlineData.mimeType).toBe("application/octet-stream");
		expect(part?.inlineData.data).toBe("raw");
	});
});
