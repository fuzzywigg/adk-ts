import { beforeEach, describe, expect, it, vi } from "vitest";

const { getFilesMock, fileMock, bucketMock, StorageMock } = vi.hoisted(() => {
	const getFilesMock = vi.fn();
	const fileMock = vi.fn();
	const bucketMock = vi.fn(() => ({
		file: fileMock,
		getFiles: getFilesMock,
	}));
	const StorageMock = vi.fn(function Storage(this: any) {
		this.bucket = bucketMock;
	});
	return { getFilesMock, fileMock, bucketMock, StorageMock };
});

vi.mock("@google-cloud/storage", () => ({
	Storage: StorageMock,
}));

import { GcsArtifactService } from "../../artifacts/gcs-artifact-service";

describe("GcsArtifactService leftover: slash-depth blobs invisible to listArtifactKeys", () => {
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
	});

	it("skips natural slash-filename blobs (depth>5) so keys never surface", async () => {
		getFilesMock
			.mockResolvedValueOnce([
				[
					{ name: "app/user-1/sess-1/nested/path.bin/0" },
					{ name: "app/user-1/sess-1/a/b/c.txt/0" },
					{ name: "app/user-1/sess-1/ok.txt/0" },
				],
			])
			.mockResolvedValueOnce([
				[
					{ name: "app/user-1/user/user:nested/path.bin/0" },
					{ name: "app/user-1/user/user:ok.json/1" },
				],
			]);
		const service = new GcsArtifactService("bucket");
		await expect(service.listArtifactKeys(base)).resolves.toEqual([
			"ok.txt",
			"user:ok.json",
		]);
	});

	it("returns empty when only slash-depth blobs exist under both prefixes", async () => {
		getFilesMock
			.mockResolvedValueOnce([[{ name: "app/user-1/sess-1/deep/file.bin/0" }]])
			.mockResolvedValueOnce([
				[{ name: "app/user-1/user/user:deep/file.bin/0" }],
			]);
		const service = new GcsArtifactService("bucket");
		await expect(service.listArtifactKeys(base)).resolves.toEqual([]);
	});
});
