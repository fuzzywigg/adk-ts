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
 * Fourteenth leftover: `version === undefined || version === null` — NaN is
 * neither, so GCS does not coalesce to latest; path uses literal `/NaN`.
 * In-memory NaN is sixth; twelfth pinned false/""/true; thirteenth "0"/"1".
 */
describe("GcsArtifactService version NaN literal path fourteenth leftover", () => {
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
		getMetadataMock.mockResolvedValue([{ contentType: "text/plain" }]);
		downloadMock.mockResolvedValue([Buffer.from("ok")]);
	});

	it("version NaN hits .../note.txt/NaN without listVersions getFiles", async () => {
		const service = new GcsArtifactService("bucket");
		await service.loadArtifact({
			...base,
			filename: "note.txt",
			version: Number.NaN,
		});
		expect(fileMock).toHaveBeenCalledWith("app/user-1/sess-1/note.txt/NaN");
		expect(getFilesMock).not.toHaveBeenCalled();
	});

	it("undefined version still lists latest (control)", async () => {
		getFilesMock.mockResolvedValue([
			[{ name: "app/user-1/sess-1/note.txt/2" }],
		]);
		const service = new GcsArtifactService("bucket");
		await service.loadArtifact({
			...base,
			filename: "note.txt",
		});
		expect(getFilesMock).toHaveBeenCalled();
		expect(fileMock).toHaveBeenCalledWith("app/user-1/sess-1/note.txt/2");
	});
});
