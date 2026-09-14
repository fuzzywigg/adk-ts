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
 * Twelfth leftover: GCS loadArtifact only nullish-coalesces to Math.max.
 * Non-nullish `false` / `""` / `true` stringify into the blob path (InMemory
 * indexes them as 0/0/1 instead).
 */
describe("GcsArtifactService version false/empty literal path twelfth leftover", () => {
	const base = {
		appName: "app",
		userId: "uid",
		sessionId: "s1",
		filename: "note.txt",
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
		getMetadataMock.mockRejectedValue({ code: 404 });
		downloadMock.mockRejectedValue({ code: 404 });
	});

	it("version false requests .../note.txt/false", async () => {
		const service = new GcsArtifactService("bucket");
		await service.loadArtifact({ ...base, version: false as any });
		expect(fileMock).toHaveBeenCalledWith("app/uid/s1/note.txt/false");
		expect(getFilesMock).not.toHaveBeenCalled();
	});

	it("version empty string requests trailing slash .../note.txt/", async () => {
		const service = new GcsArtifactService("bucket");
		await service.loadArtifact({ ...base, version: "" as any });
		expect(fileMock).toHaveBeenCalledWith("app/uid/s1/note.txt/");
	});

	it("version true requests .../note.txt/true", async () => {
		const service = new GcsArtifactService("bucket");
		await service.loadArtifact({ ...base, version: true as any });
		expect(fileMock).toHaveBeenCalledWith("app/uid/s1/note.txt/true");
	});

	it("null still lists versions (control)", async () => {
		getFilesMock.mockResolvedValue([[]]);
		const service = new GcsArtifactService("bucket");
		await expect(
			service.loadArtifact({ ...base, version: null as any }),
		).resolves.toBeNull();
		expect(getFilesMock).toHaveBeenCalled();
	});
});
