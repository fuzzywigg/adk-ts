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
 * Fourteenth leftover: `Number.parseInt(versionStr, 10)` — ninth covers
 * `"08"`, `"10abc"`, bare `" "` (NaN drop). Leading/trailing whitespace
 * segments still parse (`" 1 "` → 1).
 */
describe("GcsArtifactService listVersions parseInt whitespace segment fourteenth leftover", () => {
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
	});

	it.each([
		{ segment: " 1 ", expected: 1 },
		{ segment: "\t2\t", expected: 2 },
		{ segment: " 0 ", expected: 0 },
	])("blob segment %j parses to $expected", async ({ segment, expected }) => {
		getFilesMock.mockResolvedValue([
			[{ name: `app/user-1/sess-1/note.txt/${segment}` }],
		]);
		const service = new GcsArtifactService("bucket");
		await expect(
			service.listVersions({ ...base, filename: "note.txt" }),
		).resolves.toEqual([expected]);
	});

	it("bare whitespace segment still dropped (ninth control)", async () => {
		getFilesMock.mockResolvedValue([
			[{ name: "app/user-1/sess-1/note.txt/ " }],
		]);
		const service = new GcsArtifactService("bucket");
		await expect(
			service.listVersions({ ...base, filename: "note.txt" }),
		).resolves.toEqual([]);
	});
});
