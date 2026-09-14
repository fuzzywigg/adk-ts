import { beforeEach, describe, expect, it, vi } from "vitest";

const { saveMock, getFilesMock, fileMock, bucketMock, StorageMock } =
	vi.hoisted(() => {
		const saveMock = vi.fn().mockResolvedValue(undefined);
		const getFilesMock = vi.fn();
		const fileMock = vi.fn(() => ({
			save: saveMock,
		}));
		const bucketMock = vi.fn(() => ({
			file: fileMock,
			getFiles: getFilesMock,
		}));
		const StorageMock = vi.fn(function Storage(this: any) {
			this.bucket = bucketMock;
		});
		return { saveMock, getFilesMock, fileMock, bucketMock, StorageMock };
	});

vi.mock("@google-cloud/storage", () => ({
	Storage: StorageMock,
}));

import { GcsArtifactService } from "../../artifacts/gcs-artifact-service";

describe("GcsArtifactService leftover: slash filename → 6-segment blob → listVersions []", () => {
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
		fileMock.mockImplementation(() => ({ save: saveMock }));
		saveMock.mockResolvedValue(undefined);
	});

	it.each([
		{
			filename: "user:nested/path.bin",
			blobName: "app/user-1/user/user:nested/path.bin/0",
		},
		{
			filename: "nested/path.bin",
			blobName: "app/user-1/sess-1/nested/path.bin/0",
		},
		{
			filename: "a/b/c.txt",
			blobName: "app/user-1/sess-1/a/b/c.txt/0",
		},
	])("listVersions returns [] for existing slash-depth blob $filename", async ({
		filename,
		blobName,
	}) => {
		expect(blobName.split("/").length).toBeGreaterThan(5);
		getFilesMock.mockResolvedValue([[{ name: blobName }]]);
		const service = new GcsArtifactService("bucket");
		await expect(service.listVersions({ ...base, filename })).resolves.toEqual(
			[],
		);
	});

	it("parts.length === 5 gate ignores the natural shape of slash filenames", async () => {
		getFilesMock.mockResolvedValue([
			[
				{ name: "app/user-1/user/user:nested/path.bin/0" },
				{ name: "app/user-1/user/user:nested/path.bin/1" },
				{ name: "app/user-1/user/user:nested/path.bin/2" },
			],
		]);
		const service = new GcsArtifactService("bucket");
		await expect(
			service.listVersions({ ...base, filename: "user:nested/path.bin" }),
		).resolves.toEqual([]);
	});
});
