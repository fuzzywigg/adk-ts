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

describe("GcsArtifactService blob-path leftover edges (post #141)", () => {
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
			filename: "note.txt",
			expectedPrefix: "app/user-1/sess-1/note.txt/",
		},
		{
			filename: "user:profile.json",
			expectedPrefix: "app/user-1/user/user:profile.json/",
		},
		{
			filename: "user:nested/path.bin",
			expectedPrefix: "app/user-1/user/user:nested/path.bin/",
		},
	])("getBlobName/listVersions prefix for $filename", async ({
		filename,
		expectedPrefix,
	}) => {
		getFilesMock.mockResolvedValue([[]]);
		const service = new GcsArtifactService("bucket");
		await service.listVersions({ ...base, filename });
		expect(getFilesMock).toHaveBeenCalledWith({ prefix: expectedPrefix });
	});

	it("saveArtifact session vs user: path matrix writes distinct blob names", async () => {
		getFilesMock.mockResolvedValue([[]]);
		const service = new GcsArtifactService("bucket");

		await service.saveArtifact({
			...base,
			filename: "session.txt",
			artifact: { inlineData: { data: "a", mimeType: "text/plain" } },
		});
		expect(fileMock).toHaveBeenCalledWith("app/user-1/sess-1/session.txt/0");

		await service.saveArtifact({
			...base,
			filename: "user:u.txt",
			artifact: { inlineData: { data: "b", mimeType: "text/plain" } },
		});
		expect(fileMock).toHaveBeenCalledWith("app/user-1/user/user:u.txt/0");
	});

	it("saveArtifact continues from sparse max version for both namespaces", async () => {
		getFilesMock
			.mockResolvedValueOnce([
				[
					{ name: "app/user-1/sess-1/s.txt/0" },
					{ name: "app/user-1/sess-1/s.txt/4" },
				],
			])
			.mockResolvedValueOnce([
				[
					{ name: "app/user-1/user/user:u.txt/1" },
					{ name: "app/user-1/user/user:u.txt/7" },
				],
			]);
		const service = new GcsArtifactService("bucket");

		await expect(
			service.saveArtifact({
				...base,
				filename: "s.txt",
				artifact: { inlineData: { data: "x", mimeType: "text/plain" } },
			}),
		).resolves.toBe(5);
		expect(fileMock).toHaveBeenCalledWith("app/user-1/sess-1/s.txt/5");

		await expect(
			service.saveArtifact({
				...base,
				filename: "user:u.txt",
				artifact: { inlineData: { data: "y", mimeType: "text/plain" } },
			}),
		).resolves.toBe(8);
		expect(fileMock).toHaveBeenCalledWith("app/user-1/user/user:u.txt/8");
	});

	it.each([
		{ version: undefined, label: "undefined" },
		{ version: null as any, label: "null" },
	])("loadArtifact version=$label picks latest when versions exist", async ({
		version,
	}) => {
		getFilesMock.mockResolvedValue([
			[
				{ name: "app/user-1/sess-1/note.txt/1" },
				{ name: "app/user-1/sess-1/note.txt/3" },
			],
		]);
		getMetadataMock.mockResolvedValue([{ contentType: "text/plain" }]);
		downloadMock.mockResolvedValue([Buffer.from("latest")]);
		const service = new GcsArtifactService("bucket");
		const part = await service.loadArtifact({
			...base,
			filename: "note.txt",
			version,
		});
		expect(fileMock).toHaveBeenCalledWith("app/user-1/sess-1/note.txt/3");
		expect(part?.inlineData.data).toBe("latest");
	});

	it.each([
		{ buffer: "", label: "empty string buffer" },
		{ buffer: null, label: "null buffer" },
		{ buffer: undefined, label: "undefined buffer" },
		{ buffer: 0 as any, label: "falsy zero buffer" },
	])("loadArtifact returns null for $label", async ({ buffer }) => {
		getMetadataMock.mockResolvedValue([{ contentType: "text/plain" }]);
		downloadMock.mockResolvedValue([buffer]);
		const service = new GcsArtifactService("bucket");
		await expect(
			service.loadArtifact({ ...base, filename: "note.txt", version: 0 }),
		).resolves.toBeNull();
	});

	it("loadArtifact keeps empty Buffer payload (Buffer is truthy)", async () => {
		getMetadataMock.mockResolvedValue([{ contentType: "text/plain" }]);
		downloadMock.mockResolvedValue([Buffer.from("")]);
		const service = new GcsArtifactService("bucket");
		const part = await service.loadArtifact({
			...base,
			filename: "note.txt",
			version: 0,
		});
		expect(part?.inlineData.data).toBe("");
		expect(part?.inlineData.mimeType).toBe("text/plain");
	});

	it.each([
		{ code: 404, returnsNull: true },
		{ code: "404", returnsNull: false },
		{ code: 403, returnsNull: false },
		{ code: "NOT_FOUND_OTHER", returnsNull: false },
	])("loadArtifact error code=$code → null=$returnsNull (strict === 404)", async ({
		code,
		returnsNull,
	}) => {
		getMetadataMock.mockRejectedValue(
			Object.assign(new Error(`err-${code}`), { code }),
		);
		const service = new GcsArtifactService("bucket");
		const promise = service.loadArtifact({
			...base,
			filename: "note.txt",
			version: 0,
		});
		if (returnsNull) {
			await expect(promise).resolves.toBeNull();
		} else {
			await expect(promise).rejects.toThrow(`err-${code}`);
		}
	});

	it("loadArtifact rethrows non-404 from download after metadata succeeds", async () => {
		getMetadataMock.mockResolvedValue([{ contentType: "text/plain" }]);
		downloadMock.mockRejectedValue(
			Object.assign(new Error("download denied"), { code: 403 }),
		);
		const service = new GcsArtifactService("bucket");
		await expect(
			service.loadArtifact({ ...base, filename: "note.txt", version: 0 }),
		).rejects.toThrow(/download denied/);
	});

	it("listArtifactKeys unions session + user prefixes, skips wrong depth, sorts", async () => {
		getFilesMock
			.mockResolvedValueOnce([
				[
					{ name: "app/user-1/sess-1/b.txt/0" },
					{ name: "app/user-1/sess-1/a.txt/1" },
					{ name: "app/user-1/sess-1/too/deep/file.txt/0" },
					{ name: "app/user-1/sess-1/short" },
				],
			])
			.mockResolvedValueOnce([
				[
					{ name: "app/user-1/user/user:z.json/0" },
					{ name: "app/user-1/user/user:a.json/2" },
					{ name: "app/user-1/user/bad" },
				],
			]);
		const service = new GcsArtifactService("bucket");
		await expect(service.listArtifactKeys(base)).resolves.toEqual([
			"a.txt",
			"b.txt",
			"user:a.json",
			"user:z.json",
		]);
		expect(getFilesMock).toHaveBeenNthCalledWith(1, {
			prefix: "app/user-1/sess-1/",
		});
		expect(getFilesMock).toHaveBeenNthCalledWith(2, {
			prefix: "app/user-1/user/",
		});
	});

	it("listVersions skips NaN / wrong-depth and sorts ascending", async () => {
		getFilesMock.mockResolvedValue([
			[
				{ name: "app/user-1/sess-1/note.txt/2" },
				{ name: "app/user-1/sess-1/note.txt/0" },
				{ name: "app/user-1/sess-1/note.txt/not-a-number" },
				{ name: "app/user-1/sess-1/note.txt/1/extra" },
				{ name: "app/user-1/sess-1/note.txt/10" },
			],
		]);
		const service = new GcsArtifactService("bucket");
		await expect(
			service.listVersions({ ...base, filename: "note.txt" }),
		).resolves.toEqual([0, 2, 10]);
	});

	it("deleteArtifact deletes every listed version using namespace-aware paths", async () => {
		getFilesMock.mockResolvedValue([
			[
				{ name: "app/user-1/user/user:p.json/0" },
				{ name: "app/user-1/user/user:p.json/2" },
			],
		]);
		const service = new GcsArtifactService("bucket");
		await service.deleteArtifact({ ...base, filename: "user:p.json" });
		expect(fileMock).toHaveBeenCalledWith("app/user-1/user/user:p.json/0");
		expect(fileMock).toHaveBeenCalledWith("app/user-1/user/user:p.json/2");
		expect(deleteMock).toHaveBeenCalledTimes(2);
	});

	it("deleteArtifact is a no-op when listVersions is empty", async () => {
		getFilesMock.mockResolvedValue([[]]);
		const service = new GcsArtifactService("bucket");
		await service.deleteArtifact({ ...base, filename: "missing.txt" });
		expect(deleteMock).not.toHaveBeenCalled();
	});

	it("deleteArtifact rejects when a later version delete fails", async () => {
		getFilesMock.mockResolvedValue([
			[
				{ name: "app/user-1/sess-1/note.txt/0" },
				{ name: "app/user-1/sess-1/note.txt/1" },
			],
		]);
		deleteMock
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error("delete denied"));
		const service = new GcsArtifactService("bucket");
		await expect(
			service.deleteArtifact({ ...base, filename: "note.txt" }),
		).rejects.toThrow(/delete denied/);
	});

	it("saveArtifact propagates listVersions failure before write", async () => {
		getFilesMock.mockRejectedValueOnce(new Error("cannot list"));
		const service = new GcsArtifactService("bucket");
		await expect(
			service.saveArtifact({
				...base,
				filename: "blocked.txt",
				artifact: { inlineData: { data: "x", mimeType: "text/plain" } },
			}),
		).rejects.toThrow(/cannot list/);
		expect(saveMock).not.toHaveBeenCalled();
	});

	it("loadArtifact defaults mime when contentType missing", async () => {
		getMetadataMock.mockResolvedValue([{}]);
		downloadMock.mockResolvedValue([Buffer.from("raw")]);
		const service = new GcsArtifactService("bucket");
		const part = await service.loadArtifact({
			...base,
			filename: "note.txt",
			version: 0,
		});
		expect(part?.inlineData.mimeType).toBe("application/octet-stream");
	});

	it("listArtifactKeys returns empty when both prefixes empty", async () => {
		getFilesMock.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);
		const service = new GcsArtifactService("bucket");
		await expect(service.listArtifactKeys(base)).resolves.toEqual([]);
	});

	it("saveArtifact uses ifGenerationMatch precondition on write", async () => {
		getFilesMock.mockResolvedValue([[]]);
		const service = new GcsArtifactService("bucket");
		await service.saveArtifact({
			...base,
			filename: "note.txt",
			artifact: { inlineData: { data: "payload", mimeType: "text/plain" } },
		});
		expect(saveMock).toHaveBeenCalledWith("payload", {
			contentType: "text/plain",
			preconditionOpts: { ifGenerationMatch: 0 },
		});
	});
});
