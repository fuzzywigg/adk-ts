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
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

/**
 * Fifteenth leftover: GCS loadArtifact only nullish-coalesces version.
 * Twelfth pins `false`/`""`/`true`; thirteenth numeric strings; fourteenth
 * NaN. Whitespace `" "` stringifies into the blob path (no latest coalesce).
 * InMemory twin: `versions[" "]` misses → null.
 */
describe("gcs/in-memory version whitespace literal path fifteenth leftover", () => {
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

	it('GCS version " " requests .../note.txt/ ', async () => {
		const service = new GcsArtifactService("bucket");
		await service.loadArtifact({ ...base, version: " " as any });
		expect(fileMock).toHaveBeenCalledWith("app/uid/s1/note.txt/ ");
		expect(getFilesMock).not.toHaveBeenCalled();
	});

	it('InMemory version " " indexes as miss → null', async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			artifact: { text: "v0" },
		});
		await expect(
			service.loadArtifact({ ...base, version: " " as any }),
		).resolves.toBeNull();
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
