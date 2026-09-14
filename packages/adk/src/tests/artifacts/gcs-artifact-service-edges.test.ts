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
	const StorageMock = vi.fn(function Storage(this: any, opts?: unknown) {
		this.bucket = bucketMock;
		this.options = opts;
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

	it("passes full storage options through to Storage constructor", () => {
		const options = {
			projectId: "proj",
			keyFilename: "/tmp/key.json",
			apiEndpoint: "https://storage.googleapis.com",
		};
		new GcsArtifactService("bucket-x", options);
		expect(StorageMock).toHaveBeenCalledWith(options);
		expect(bucketMock).toHaveBeenCalledWith("bucket-x");
	});

	it("saveArtifact propagates listVersions failures", async () => {
		getFilesMock.mockRejectedValueOnce(new Error("list failed"));
		const service = new GcsArtifactService("b");
		await expect(
			service.saveArtifact({
				...base,
				filename: "x.txt",
				artifact: {
					inlineData: { data: "x", mimeType: "text/plain" },
				},
			}),
		).rejects.toThrow(/list failed/);
	});

	it("saveArtifact propagates blob.save precondition conflicts", async () => {
		getFilesMock.mockResolvedValueOnce([[]]);
		saveMock.mockRejectedValueOnce(
			Object.assign(new Error("precondition"), { code: 412 }),
		);
		const service = new GcsArtifactService("b");
		await expect(
			service.saveArtifact({
				...base,
				filename: "x.txt",
				artifact: {
					inlineData: { data: "x", mimeType: "text/plain" },
				},
			}),
		).rejects.toThrow(/precondition/);
		expect(saveMock).toHaveBeenCalledWith("x", {
			contentType: "text/plain",
			preconditionOpts: { ifGenerationMatch: 0 },
		});
	});

	it("saveArtifact forwards undefined inlineData.data to blob.save", async () => {
		getFilesMock.mockResolvedValueOnce([[]]);
		const service = new GcsArtifactService("b");
		const version = await service.saveArtifact({
			...base,
			filename: "x.txt",
			artifact: {
				inlineData: { mimeType: "text/plain" },
			} as any,
		});
		expect(version).toBe(0);
		expect(saveMock).toHaveBeenCalledWith(undefined, {
			contentType: "text/plain",
			preconditionOpts: { ifGenerationMatch: 0 },
		});
	});

	it("deleteArtifact fails when one version delete rejects", async () => {
		getFilesMock.mockResolvedValue([
			[
				{ name: "app/user-1/sess-1/multi.txt/0" },
				{ name: "app/user-1/sess-1/multi.txt/1" },
			],
		]);
		deleteMock
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error("delete denied"));
		const service = new GcsArtifactService("b");
		await expect(
			service.deleteArtifact({ ...base, filename: "multi.txt" }),
		).rejects.toThrow(/delete denied/);
	});

	it("listArtifactKeys propagates getFiles failures", async () => {
		getFilesMock.mockRejectedValueOnce(new Error("session prefix failed"));
		const service = new GcsArtifactService("b");
		await expect(service.listArtifactKeys(base)).rejects.toThrow(
			/session prefix failed/,
		);
	});

	it("listArtifactKeys ignores blob names with parts.length !== 5", async () => {
		getFilesMock
			.mockResolvedValueOnce([
				[
					{ name: "app/user-1/sess-1/ok.txt/0" },
					{ name: "app/user-1/sess-1/too/deep/path/0" },
					{ name: "short" },
					{ name: "app/user-1/sess-1/also.txt/1" },
				],
			])
			.mockResolvedValueOnce([
				[
					{ name: "app/user-1/user/user:profile.json/0" },
					{ name: "app/user-1/user/extra/parts/here/0" },
				],
			]);
		const service = new GcsArtifactService("b");
		await expect(service.listArtifactKeys(base)).resolves.toEqual([
			"also.txt",
			"ok.txt",
			"user:profile.json",
		]);
	});

	it("listVersions skips non-numeric version segments and sorts", async () => {
		getFilesMock.mockResolvedValue([
			[
				{ name: "app/user-1/sess-1/v.txt/2" },
				{ name: "app/user-1/sess-1/v.txt/10" },
				{ name: "app/user-1/sess-1/v.txt/abc" },
				{ name: "app/user-1/sess-1/v.txt/1" },
				{ name: "app/user-1/sess-1/v.txt/extra/9" },
			],
		]);
		const service = new GcsArtifactService("b");
		await expect(
			service.listVersions({ ...base, filename: "v.txt" }),
		).resolves.toEqual([1, 2, 10]);
	});

	it("listVersions propagates getFiles errors", async () => {
		getFilesMock.mockRejectedValueOnce(new Error("versions failed"));
		const service = new GcsArtifactService("b");
		await expect(
			service.listVersions({ ...base, filename: "x.txt" }),
		).rejects.toThrow(/versions failed/);
	});

	it("loadArtifact rethrows non-404 errors", async () => {
		getMetadataMock.mockRejectedValueOnce(
			Object.assign(new Error("permission"), { code: 403 }),
		);
		const service = new GcsArtifactService("b");
		await expect(
			service.loadArtifact({
				...base,
				filename: "x.txt",
				version: 0,
			}),
		).rejects.toThrow(/permission/);
	});

	it("loadArtifact returns null on 404", async () => {
		getMetadataMock.mockRejectedValueOnce(
			Object.assign(new Error("missing"), { code: 404 }),
		);
		const service = new GcsArtifactService("b");
		await expect(
			service.loadArtifact({
				...base,
				filename: "x.txt",
				version: 0,
			}),
		).resolves.toBeNull();
	});

	it("loadArtifact returns null when download buffer is undefined", async () => {
		getMetadataMock.mockResolvedValue([{ contentType: "text/plain" }]);
		downloadMock.mockResolvedValue([undefined]);
		const service = new GcsArtifactService("b");
		await expect(
			service.loadArtifact({
				...base,
				filename: "x.txt",
				version: 0,
			}),
		).resolves.toBeNull();
	});

	it("loadArtifact defaults mimeType when contentType missing", async () => {
		getMetadataMock.mockResolvedValue([{}]);
		downloadMock.mockResolvedValue([Buffer.from("bytes")]);
		const service = new GcsArtifactService("b");
		await expect(
			service.loadArtifact({
				...base,
				filename: "x.txt",
				version: 0,
			}),
		).resolves.toEqual({
			inlineData: {
				data: "bytes",
				mimeType: "application/octet-stream",
			},
		});
	});

	it("loadArtifact latest returns null when no versions exist", async () => {
		getFilesMock.mockResolvedValue([[]]);
		const service = new GcsArtifactService("b");
		await expect(
			service.loadArtifact({ ...base, filename: "ghost.txt" }),
		).resolves.toBeNull();
	});

	it("saveArtifact uses ifGenerationMatch 0 precondition every time", async () => {
		getFilesMock.mockResolvedValue([
			[{ name: "app/user-1/sess-1/note.txt/0" }],
		]);
		const service = new GcsArtifactService("b");
		await service.saveArtifact({
			...base,
			filename: "note.txt",
			artifact: {
				inlineData: { data: "v1", mimeType: "text/plain" },
			},
		});
		expect(saveMock).toHaveBeenCalledWith(
			"v1",
			expect.objectContaining({
				preconditionOpts: { ifGenerationMatch: 0 },
			}),
		);
	});

	it("deleteArtifact deletes every listed version in parallel", async () => {
		getFilesMock.mockResolvedValue([
			[
				{ name: "app/user-1/sess-1/all.txt/0" },
				{ name: "app/user-1/sess-1/all.txt/1" },
				{ name: "app/user-1/sess-1/all.txt/2" },
			],
		]);
		const service = new GcsArtifactService("b");
		await service.deleteArtifact({ ...base, filename: "all.txt" });
		expect(deleteMock).toHaveBeenCalledTimes(3);
		expect(fileMock).toHaveBeenCalledWith("app/user-1/sess-1/all.txt/0");
		expect(fileMock).toHaveBeenCalledWith("app/user-1/sess-1/all.txt/1");
		expect(fileMock).toHaveBeenCalledWith("app/user-1/sess-1/all.txt/2");
	});

	it("listArtifactKeys fails if user-namespace getFiles fails after session succeeds", async () => {
		getFilesMock
			.mockResolvedValueOnce([[{ name: "app/user-1/sess-1/a.txt/0" }]])
			.mockRejectedValueOnce(new Error("user prefix failed"));
		const service = new GcsArtifactService("b");
		await expect(service.listArtifactKeys(base)).rejects.toThrow(
			/user prefix failed/,
		);
	});

	it("constructs without options", () => {
		new GcsArtifactService("solo");
		expect(StorageMock).toHaveBeenCalledWith(undefined);
		expect(bucketMock).toHaveBeenCalledWith("solo");
	});
});
