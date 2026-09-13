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

describe("GcsArtifactService", () => {
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

	it("constructs Storage with options and selects the bucket", () => {
		const options = { projectId: "proj" };
		new GcsArtifactService("my-bucket", options);
		expect(StorageMock).toHaveBeenCalledWith(options);
		expect(bucketMock).toHaveBeenCalledWith("my-bucket");
	});

	it("saveArtifact starts at version 0 then increments from max", async () => {
		getFilesMock.mockResolvedValueOnce([[]]);
		const service = new GcsArtifactService("b");
		const v0 = await service.saveArtifact({
			...base,
			filename: "note.txt",
			artifact: {
				inlineData: { data: "hello", mimeType: "text/plain" },
			},
		});
		expect(v0).toBe(0);
		expect(fileMock).toHaveBeenCalledWith("app/user-1/sess-1/note.txt/0");
		expect(saveMock).toHaveBeenCalledWith("hello", {
			contentType: "text/plain",
			preconditionOpts: { ifGenerationMatch: 0 },
		});

		getFilesMock.mockResolvedValueOnce([
			[
				{ name: "app/user-1/sess-1/note.txt/0" },
				{ name: "app/user-1/sess-1/note.txt/2" },
			],
		]);
		const v3 = await service.saveArtifact({
			...base,
			filename: "note.txt",
			artifact: {
				inlineData: { data: "next", mimeType: "text/plain" },
			},
		});
		expect(v3).toBe(3);
		expect(fileMock).toHaveBeenCalledWith("app/user-1/sess-1/note.txt/3");
	});

	it("uses user-namespace blob paths for user: filenames", async () => {
		getFilesMock.mockResolvedValue([[]]);
		const service = new GcsArtifactService("b");
		await service.saveArtifact({
			...base,
			filename: "user:profile.json",
			artifact: {
				inlineData: { data: "{}", mimeType: "application/json" },
			},
		});
		expect(fileMock).toHaveBeenCalledWith(
			"app/user-1/user/user:profile.json/0",
		);
	});

	it("loadArtifact returns null when no versions exist", async () => {
		getFilesMock.mockResolvedValue([[]]);
		const service = new GcsArtifactService("b");
		await expect(
			service.loadArtifact({ ...base, filename: "missing.txt" }),
		).resolves.toBeNull();
	});

	it("loadArtifact without version picks the latest and defaults mime type", async () => {
		getFilesMock.mockResolvedValue([
			[
				{ name: "app/user-1/sess-1/note.txt/0" },
				{ name: "app/user-1/sess-1/note.txt/1" },
			],
		]);
		getMetadataMock.mockResolvedValue([{}]);
		downloadMock.mockResolvedValue([Buffer.from("latest")]);
		const service = new GcsArtifactService("b");
		const part = await service.loadArtifact({
			...base,
			filename: "note.txt",
		});
		expect(fileMock).toHaveBeenCalledWith("app/user-1/sess-1/note.txt/1");
		expect(part).toEqual({
			inlineData: {
				data: "latest",
				mimeType: "application/octet-stream",
			},
		});
	});

	it("loadArtifact returns null for empty download buffer", async () => {
		getMetadataMock.mockResolvedValue([{ contentType: "text/plain" }]);
		downloadMock.mockResolvedValue([undefined]);
		const service = new GcsArtifactService("b");
		await expect(
			service.loadArtifact({
				...base,
				filename: "note.txt",
				version: 0,
			}),
		).resolves.toBeNull();
	});

	it("loadArtifact returns null on 404 and rethrows other errors", async () => {
		const service = new GcsArtifactService("b");
		getMetadataMock.mockRejectedValueOnce({ code: 404 });
		await expect(
			service.loadArtifact({
				...base,
				filename: "note.txt",
				version: 0,
			}),
		).resolves.toBeNull();

		getMetadataMock.mockRejectedValueOnce(new Error("permission denied"));
		await expect(
			service.loadArtifact({
				...base,
				filename: "note.txt",
				version: 0,
			}),
		).rejects.toThrow("permission denied");
	});

	it("listArtifactKeys unions session and user prefixes, sorts, and ignores bad paths", async () => {
		getFilesMock
			.mockResolvedValueOnce([
				[
					{ name: "app/user-1/sess-1/b.txt/0" },
					{ name: "app/user-1/sess-1/ignored" },
					{ name: "app/user-1/sess-1/a.txt/1" },
				],
			])
			.mockResolvedValueOnce([[{ name: "app/user-1/user/user:z.json/0" }]]);
		const service = new GcsArtifactService("b");
		await expect(service.listArtifactKeys(base)).resolves.toEqual([
			"a.txt",
			"b.txt",
			"user:z.json",
		]);
		expect(getFilesMock).toHaveBeenCalledWith({
			prefix: "app/user-1/sess-1/",
		});
		expect(getFilesMock).toHaveBeenCalledWith({
			prefix: "app/user-1/user/",
		});
	});

	it("deleteArtifact deletes every version", async () => {
		getFilesMock.mockResolvedValue([
			[
				{ name: "app/user-1/sess-1/note.txt/0" },
				{ name: "app/user-1/sess-1/note.txt/1" },
			],
		]);
		const service = new GcsArtifactService("b");
		await service.deleteArtifact({ ...base, filename: "note.txt" });
		expect(deleteMock).toHaveBeenCalledTimes(2);
		expect(fileMock).toHaveBeenCalledWith("app/user-1/sess-1/note.txt/0");
		expect(fileMock).toHaveBeenCalledWith("app/user-1/sess-1/note.txt/1");
	});

	it("listVersions skips NaN segments and sorts ascending", async () => {
		getFilesMock.mockResolvedValue([
			[
				{ name: "app/user-1/sess-1/note.txt/2" },
				{ name: "app/user-1/sess-1/note.txt/bad" },
				{ name: "app/user-1/sess-1/note.txt/0" },
				{ name: "app/user-1/sess-1/note.txt/extra/1" },
			],
		]);
		const service = new GcsArtifactService("b");
		await expect(
			service.listVersions({ ...base, filename: "note.txt" }),
		).resolves.toEqual([0, 2]);
	});
});
