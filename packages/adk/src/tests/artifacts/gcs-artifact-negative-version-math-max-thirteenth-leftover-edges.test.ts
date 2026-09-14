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
 * Thirteenth leftover: parseInt accepts negative version segments; Math.max
 * of only-negatives can yield next version 0. Ninth leftover covers partial
 * parseInt and full-NaN drops; tenth covers positive hole Math.max.
 */
describe("GcsArtifactService negative version segment Math.max thirteenth leftover", () => {
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
		saveMock.mockResolvedValue(undefined);
	});

	it("listVersions accepts negative segments as numbers", async () => {
		getFilesMock.mockResolvedValue([
			[{ name: "app/uid/s1/note.txt/-5" }, { name: "app/uid/s1/note.txt/-1" }],
		]);
		const service = new GcsArtifactService("bucket");
		await expect(service.listVersions(base)).resolves.toEqual([-5, -1]);
	});

	it("only-negative versions → next save is 0 via Math.max+1", async () => {
		getFilesMock.mockResolvedValue([
			[{ name: "app/uid/s1/note.txt/-5" }, { name: "app/uid/s1/note.txt/-1" }],
		]);
		const service = new GcsArtifactService("bucket");
		const version = await service.saveArtifact({
			...base,
			artifact: { inlineData: { data: "x", mimeType: "text/plain" } },
		});
		expect(version).toBe(0);
		expect(fileMock).toHaveBeenCalledWith("app/uid/s1/note.txt/0");
	});

	it('leading-space " 5" parses to 5 (vs bare space NaN drop)', async () => {
		getFilesMock.mockResolvedValue([[{ name: "app/uid/s1/note.txt/ 5" }]]);
		const service = new GcsArtifactService("bucket");
		await expect(service.listVersions(base)).resolves.toEqual([5]);
	});
});
