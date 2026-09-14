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
 * Tenth leftover: saveArtifact uses versions.length === 0 ? 0 : Math.max(...)+1
 * so holes are never filled; load version 0 skips listVersions entirely.
 */
describe("GcsArtifactService version hole Math.max tenth leftover", () => {
	const base = {
		appName: "app",
		userId: "uid",
		sessionId: "s1",
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

	it("existing [0,2] next save is 3 (does not fill hole 1)", async () => {
		getFilesMock.mockResolvedValue([
			[{ name: "app/uid/s1/note.txt/0" }, { name: "app/uid/s1/note.txt/2" }],
		]);
		const service = new GcsArtifactService("bucket");
		const version = await service.saveArtifact({
			...base,
			filename: "note.txt",
			artifact: { inlineData: { data: "x", mimeType: "text/plain" } },
		});
		expect(version).toBe(3);
		expect(fileMock).toHaveBeenCalledWith("app/uid/s1/note.txt/3");
	});

	it("sparse high watermark [5] next save is 6 not 0", async () => {
		getFilesMock.mockResolvedValue([[{ name: "app/uid/s1/note.txt/5" }]]);
		const service = new GcsArtifactService("bucket");
		await expect(
			service.saveArtifact({
				...base,
				filename: "note.txt",
				artifact: { inlineData: { data: "x", mimeType: "text/plain" } },
			}),
		).resolves.toBe(6);
		expect(fileMock).toHaveBeenCalledWith("app/uid/s1/note.txt/6");
	});

	it("unsorted [2,0,9] still uses Math.max → 10", async () => {
		getFilesMock.mockResolvedValue([
			[
				{ name: "app/uid/s1/note.txt/2" },
				{ name: "app/uid/s1/note.txt/0" },
				{ name: "app/uid/s1/note.txt/9" },
			],
		]);
		const service = new GcsArtifactService("bucket");
		await expect(
			service.saveArtifact({
				...base,
				filename: "note.txt",
				artifact: { inlineData: { data: "x", mimeType: "text/plain" } },
			}),
		).resolves.toBe(10);
	});

	it("all-NaN version segments → empty list → save writes v0", async () => {
		getFilesMock.mockResolvedValue([
			[{ name: "app/uid/s1/note.txt/abc" }, { name: "app/uid/s1/note.txt/ " }],
		]);
		const service = new GcsArtifactService("bucket");
		await expect(
			service.saveArtifact({
				...base,
				filename: "note.txt",
				artifact: { inlineData: { data: "x", mimeType: "text/plain" } },
			}),
		).resolves.toBe(0);
		expect(fileMock).toHaveBeenCalledWith("app/uid/s1/note.txt/0");
	});

	it("load version 0 does not call listVersions / getFiles", async () => {
		getMetadataMock.mockResolvedValue([{ contentType: "text/plain" }]);
		downloadMock.mockResolvedValue([Buffer.from("v0")]);
		const service = new GcsArtifactService("bucket");
		await service.loadArtifact({ ...base, filename: "note.txt", version: 0 });
		expect(getFilesMock).not.toHaveBeenCalled();
		expect(fileMock).toHaveBeenCalledWith("app/uid/s1/note.txt/0");
	});

	it("load latest with holes picks Math.max not length-1", async () => {
		getFilesMock.mockResolvedValue([
			[{ name: "app/uid/s1/note.txt/0" }, { name: "app/uid/s1/note.txt/4" }],
		]);
		getMetadataMock.mockResolvedValue([{ contentType: "text/plain" }]);
		downloadMock.mockResolvedValue([Buffer.from("latest")]);
		const service = new GcsArtifactService("bucket");
		await service.loadArtifact({ ...base, filename: "note.txt" });
		expect(fileMock).toHaveBeenCalledWith("app/uid/s1/note.txt/4");
	});
});
