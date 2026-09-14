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

describe("GcsArtifactService slash-depth list death ninth leftover (post #164)", () => {
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
		saveMock.mockResolvedValue(undefined);
		deleteMock.mockResolvedValue(undefined);
	});

	it.each([
		{
			filename: "dir/file.txt",
			savedBlob: "app/user-1/sess-1/dir/file.txt/0",
			segments: 6,
		},
		{
			filename: "a/b/c.bin",
			savedBlob: "app/user-1/sess-1/a/b/c.bin/0",
			segments: 7,
		},
		{
			filename: "user:folder/nested.txt",
			savedBlob: "app/user-1/user/user:folder/nested.txt/0",
			segments: 6,
		},
	])("listVersions returns [] for self-written slash filename $filename (parts.length!==5)", async ({
		filename,
		savedBlob,
		segments,
	}) => {
		expect(savedBlob.split("/")).toHaveLength(segments);
		getFilesMock
			.mockResolvedValueOnce([[]])
			.mockResolvedValueOnce([[{ name: savedBlob }]]);
		const service = new GcsArtifactService("bucket");
		await expect(
			service.saveArtifact({
				...base,
				filename,
				artifact: { inlineData: { data: "x", mimeType: "text/plain" } },
			}),
		).resolves.toBe(0);
		expect(fileMock).toHaveBeenCalledWith(savedBlob);

		await expect(service.listVersions({ ...base, filename })).resolves.toEqual(
			[],
		);
	});

	it("saveArtifact after nested save always re-picks version 0 because listVersions is empty", async () => {
		const filename = "nested/path.txt";
		const blob = "app/user-1/sess-1/nested/path.txt/0";
		getFilesMock
			.mockResolvedValueOnce([[]])
			.mockResolvedValueOnce([[{ name: blob }]]);
		const service = new GcsArtifactService("bucket");
		await expect(
			service.saveArtifact({
				...base,
				filename,
				artifact: { inlineData: { data: "a", mimeType: "text/plain" } },
			}),
		).resolves.toBe(0);
		await expect(
			service.saveArtifact({
				...base,
				filename,
				artifact: { inlineData: { data: "b", mimeType: "text/plain" } },
			}),
		).resolves.toBe(0);
		expect(fileMock).toHaveBeenLastCalledWith(blob);
	});

	it("listArtifactKeys omits slash-in-filename blobs that GCS actually stores", async () => {
		getFilesMock
			.mockResolvedValueOnce([
				[
					{ name: "app/user-1/sess-1/ok.txt/0" },
					{ name: "app/user-1/sess-1/nested/path.txt/0" },
					{ name: "app/user-1/sess-1/a/b/c.txt/1" },
				],
			])
			.mockResolvedValueOnce([
				[
					{ name: "app/user-1/user/user:ok.json/0" },
					{ name: "app/user-1/user/user:folder/x.json/0" },
				],
			]);
		const service = new GcsArtifactService("bucket");
		await expect(service.listArtifactKeys(base)).resolves.toEqual([
			"ok.txt",
			"user:ok.json",
		]);
	});

	it("deleteArtifact is a no-op for nested filename when listVersions cannot parse versions", async () => {
		getFilesMock.mockResolvedValue([
			[{ name: "app/user-1/sess-1/nested/path.txt/0" }],
		]);
		const service = new GcsArtifactService("bucket");
		await service.deleteArtifact({ ...base, filename: "nested/path.txt" });
		expect(deleteMock).not.toHaveBeenCalled();
	});
});
