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
 * Thirteenth leftover: GCS getBlobName stringifies version into the path.
 * Twelfth pinned false/""/true literal segments. Numeric strings "0"/"1"
 * collide with real version paths (same as numeric 0/1), unlike boolean false.
 */
describe("GcsArtifactService version numeric-string path thirteenth leftover", () => {
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

	it.each([
		{ label: '"0"', version: "0" as any, path: "app/user-1/sess-1/note.txt/0" },
		{ label: '"1"', version: "1" as any, path: "app/user-1/sess-1/note.txt/1" },
		{ label: "numeric 0", version: 0, path: "app/user-1/sess-1/note.txt/0" },
	])("loadArtifact version $label hits path $path", async ({
		version,
		path,
	}) => {
		const service = new GcsArtifactService("bucket");
		await service.loadArtifact({
			...base,
			filename: "note.txt",
			version,
		});
		expect(fileMock).toHaveBeenCalledWith(path);
	});

	it("boolean false still uses literal /false segment (twelfth control)", async () => {
		const service = new GcsArtifactService("bucket");
		await service.loadArtifact({
			...base,
			filename: "note.txt",
			version: false as any,
		});
		expect(fileMock).toHaveBeenCalledWith("app/user-1/sess-1/note.txt/false");
	});
});
