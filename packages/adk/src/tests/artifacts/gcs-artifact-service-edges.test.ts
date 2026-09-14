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

describe("GcsArtifactService leftover edges", () => {
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

	it("getBlobName builds session and user namespaces", () => {
		const service = new GcsArtifactService("bucket");
		expect((service as any).getBlobName("app", "u", "s", "file.txt", 3)).toBe(
			"app/u/s/file.txt/3",
		);
		expect(
			(service as any).getBlobName("app", "u", "s", "user:prefs.json", 0),
		).toBe("app/u/user/user:prefs.json/0");
	});

	it("fileHasUserNamespace only matches user: prefix", () => {
		const service = new GcsArtifactService("bucket");
		expect((service as any).fileHasUserNamespace("user:x")).toBe(true);
		expect((service as any).fileHasUserNamespace("users:x")).toBe(false);
		expect((service as any).fileHasUserNamespace("xuser:y")).toBe(false);
	});

	it("saveArtifact uses mimeType from inlineData and version 0 on empty list", async () => {
		getFilesMock.mockResolvedValueOnce([[]]);
		const service = new GcsArtifactService("bucket");
		const version = await service.saveArtifact({
			...base,
			filename: "note.txt",
			artifact: {
				inlineData: { data: "aGVsbG8=", mimeType: "text/plain" },
			} as any,
		});
		expect(version).toBe(0);
		expect(fileMock).toHaveBeenCalledWith("app/user-1/sess-1/note.txt/0");
		expect(saveMock).toHaveBeenCalledWith("aGVsbG8=", {
			contentType: "text/plain",
			preconditionOpts: { ifGenerationMatch: 0 },
		});
	});

	it("saveArtifact continues from max when versions are sparse", async () => {
		getFilesMock.mockResolvedValueOnce([
			[
				{ name: "app/user-1/sess-1/note.txt/0" },
				{ name: "app/user-1/sess-1/note.txt/5" },
			],
		]);
		const service = new GcsArtifactService("bucket");
		const version = await service.saveArtifact({
			...base,
			filename: "note.txt",
			artifact: {
				inlineData: { data: "Yg==", mimeType: "text/plain" },
			} as any,
		});
		expect(version).toBe(6);
		expect(fileMock).toHaveBeenCalledWith("app/user-1/sess-1/note.txt/6");
	});

	it("loadArtifact with version 0 loads the zero blob", async () => {
		getMetadataMock.mockResolvedValueOnce([{ contentType: "text/plain" }]);
		downloadMock.mockResolvedValueOnce([Buffer.from("hello")]);
		const service = new GcsArtifactService("bucket");
		const part = await service.loadArtifact({
			...base,
			filename: "note.txt",
			version: 0,
		});
		expect(part?.inlineData?.mimeType).toBe("text/plain");
		expect(fileMock).toHaveBeenCalledWith("app/user-1/sess-1/note.txt/0");
	});

	it("listVersions sorts numeric versions ascending and skips junk", async () => {
		getFilesMock.mockResolvedValueOnce([
			[
				{ name: "app/user-1/sess-1/note.txt/2" },
				{ name: "app/user-1/sess-1/note.txt/10" },
				{ name: "app/user-1/sess-1/note.txt/abc" },
				{ name: "app/user-1/sess-1/note.txt" },
				{ name: "app/user-1/sess-1/note.txt/1" },
			],
		]);
		const service = new GcsArtifactService("bucket");
		await expect(
			service.listVersions({ ...base, filename: "note.txt" }),
		).resolves.toEqual([1, 2, 10]);
	});

	it("listArtifactKeys sorts and de-dupes session plus user filenames", async () => {
		getFilesMock
			.mockResolvedValueOnce([
				[
					{ name: "app/user-1/sess-1/b.txt/0" },
					{ name: "app/user-1/sess-1/a.txt/0" },
					{ name: "app/user-1/sess-1/a.txt/1" },
				],
			])
			.mockResolvedValueOnce([
				[
					{ name: "app/user-1/user/user:z.txt/0" },
					{ name: "app/user-1/user/user:a.txt/0" },
				],
			]);
		const service = new GcsArtifactService("bucket");
		await expect(service.listArtifactKeys(base)).resolves.toEqual([
			"a.txt",
			"b.txt",
			"user:a.txt",
			"user:z.txt",
		]);
	});

	it("deleteArtifact deletes every listed version in order", async () => {
		getFilesMock.mockResolvedValueOnce([
			[
				{ name: "app/user-1/sess-1/note.txt/0" },
				{ name: "app/user-1/sess-1/note.txt/1" },
			],
		]);
		const service = new GcsArtifactService("bucket");
		await service.deleteArtifact({ ...base, filename: "note.txt" });
		expect(fileMock).toHaveBeenCalledWith("app/user-1/sess-1/note.txt/0");
		expect(fileMock).toHaveBeenCalledWith("app/user-1/sess-1/note.txt/1");
		expect(deleteMock).toHaveBeenCalledTimes(2);
	});

	it("loadArtifact returns null when versions list is empty for latest lookup", async () => {
		getFilesMock.mockResolvedValueOnce([[]]);
		const service = new GcsArtifactService("bucket");
		await expect(
			service.loadArtifact({ ...base, filename: "missing.txt" }),
		).resolves.toBeNull();
	});

	it("saveArtifact for user: files writes under the user namespace", async () => {
		getFilesMock.mockResolvedValueOnce([[]]);
		const service = new GcsArtifactService("bucket");
		await service.saveArtifact({
			...base,
			filename: "user:avatar.png",
			artifact: {
				inlineData: { data: "QQ==", mimeType: "image/png" },
			} as any,
		});
		expect(fileMock).toHaveBeenCalledWith("app/user-1/user/user:avatar.png/0");
	});
});
