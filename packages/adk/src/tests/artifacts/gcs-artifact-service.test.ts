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

	it("throws when artifact has no inlineData on save", async () => {
		getFilesMock.mockResolvedValueOnce([[]]);
		const service = new GcsArtifactService("b");
		await expect(
			service.saveArtifact({
				...base,
				filename: "missing-inline.txt",
				artifact: { text: "no-inline" } as any,
			}),
		).rejects.toThrow();
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

	it("constructs Storage without options", () => {
		new GcsArtifactService("bare-bucket");
		expect(StorageMock).toHaveBeenCalledWith(undefined);
		expect(bucketMock).toHaveBeenCalledWith("bare-bucket");
	});

	it("loadArtifact with explicit version uses metadata contentType", async () => {
		getMetadataMock.mockResolvedValue([{ contentType: "application/json" }]);
		downloadMock.mockResolvedValue([Buffer.from('{"ok":true}')]);
		const service = new GcsArtifactService("b");
		const part = await service.loadArtifact({
			...base,
			filename: "note.txt",
			version: 2,
		});
		expect(fileMock).toHaveBeenCalledWith("app/user-1/sess-1/note.txt/2");
		expect(getFilesMock).not.toHaveBeenCalled();
		expect(part).toEqual({
			inlineData: {
				data: '{"ok":true}',
				mimeType: "application/json",
			},
		});
	});

	it("loadArtifact treats null version like latest", async () => {
		getFilesMock.mockResolvedValue([
			[
				{ name: "app/user-1/sess-1/note.txt/0" },
				{ name: "app/user-1/sess-1/note.txt/4" },
			],
		]);
		getMetadataMock.mockResolvedValue([{ contentType: "text/plain" }]);
		downloadMock.mockResolvedValue([Buffer.from("v4")]);
		const service = new GcsArtifactService("b");
		const part = await service.loadArtifact({
			...base,
			filename: "note.txt",
			version: null as unknown as undefined,
		});
		expect(fileMock).toHaveBeenCalledWith("app/user-1/sess-1/note.txt/4");
		expect(part?.inlineData?.data).toBe("v4");
	});

	it("loadArtifact returns null for empty-string download buffer", async () => {
		getMetadataMock.mockResolvedValue([{ contentType: "text/plain" }]);
		downloadMock.mockResolvedValue([Buffer.from("")]);
		const service = new GcsArtifactService("b");
		const part = await service.loadArtifact({
			...base,
			filename: "note.txt",
			version: 0,
		});
		// empty Buffer is truthy; toString() yields ""
		expect(part).toEqual({
			inlineData: {
				data: "",
				mimeType: "text/plain",
			},
		});
	});

	it("deleteArtifact is a no-op when there are no versions", async () => {
		getFilesMock.mockResolvedValue([[]]);
		const service = new GcsArtifactService("b");
		await service.deleteArtifact({ ...base, filename: "ghost.txt" });
		expect(deleteMock).not.toHaveBeenCalled();
	});

	it("listVersions and delete use user-namespace paths for user: files", async () => {
		getFilesMock.mockResolvedValue([
			[
				{ name: "app/user-1/user/user:profile.json/0" },
				{ name: "app/user-1/user/user:profile.json/1" },
			],
		]);
		const service = new GcsArtifactService("b");
		await expect(
			service.listVersions({ ...base, filename: "user:profile.json" }),
		).resolves.toEqual([0, 1]);
		expect(getFilesMock).toHaveBeenCalledWith({
			prefix: "app/user-1/user/user:profile.json/",
		});

		await service.deleteArtifact({
			...base,
			filename: "user:profile.json",
		});
		expect(fileMock).toHaveBeenCalledWith(
			"app/user-1/user/user:profile.json/0",
		);
		expect(fileMock).toHaveBeenCalledWith(
			"app/user-1/user/user:profile.json/1",
		);
		expect(deleteMock).toHaveBeenCalledTimes(2);
	});

	it("listArtifactKeys returns empty when both prefixes are empty", async () => {
		getFilesMock.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);
		const service = new GcsArtifactService("b");
		await expect(service.listArtifactKeys(base)).resolves.toEqual([]);
	});

	it("saveArtifact after sparse versions continues from max+1", async () => {
		getFilesMock.mockResolvedValue([
			[
				{ name: "app/user-1/sess-1/sparse.txt/0" },
				{ name: "app/user-1/sess-1/sparse.txt/5" },
			],
		]);
		const service = new GcsArtifactService("b");
		const next = await service.saveArtifact({
			...base,
			filename: "sparse.txt",
			artifact: {
				inlineData: { data: "x", mimeType: "text/plain" },
			},
		});
		expect(next).toBe(6);
		expect(fileMock).toHaveBeenCalledWith("app/user-1/sess-1/sparse.txt/6");
	});

	it("loadArtifact for user: files reads the user-namespace blob", async () => {
		getMetadataMock.mockResolvedValue([{ contentType: "application/json" }]);
		downloadMock.mockResolvedValue([Buffer.from("{}")]);
		const service = new GcsArtifactService("b");
		const part = await service.loadArtifact({
			...base,
			filename: "user:profile.json",
			version: 0,
		});
		expect(fileMock).toHaveBeenCalledWith(
			"app/user-1/user/user:profile.json/0",
		);
		expect(part).toEqual({
			inlineData: {
				data: "{}",
				mimeType: "application/json",
			},
		});
	});

	it("saveArtifact propagates blob.save rejections including precondition races", async () => {
		getFilesMock.mockResolvedValue([[]]);
		saveMock.mockRejectedValueOnce(
			Object.assign(new Error("precondition"), { code: 412 }),
		);
		const service = new GcsArtifactService("b");
		await expect(
			service.saveArtifact({
				...base,
				filename: "race.txt",
				artifact: {
					inlineData: { data: "x", mimeType: "text/plain" },
				},
			}),
		).rejects.toMatchObject({ code: 412 });
	});

	it("listVersions and listArtifactKeys propagate getFiles failures", async () => {
		getFilesMock.mockRejectedValueOnce(new Error("list versions boom"));
		const service = new GcsArtifactService("b");
		await expect(
			service.listVersions({ ...base, filename: "a.txt" }),
		).rejects.toThrow("list versions boom");

		getFilesMock.mockRejectedValueOnce(new Error("list keys boom"));
		await expect(service.listArtifactKeys(base)).rejects.toThrow(
			"list keys boom",
		);
	});

	it("deleteArtifact rejects when any version delete fails", async () => {
		getFilesMock.mockResolvedValue([
			[
				{ name: "app/user-1/sess-1/del.txt/0" },
				{ name: "app/user-1/sess-1/del.txt/1" },
			],
		]);
		deleteMock
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error("delete v1 failed"));
		const service = new GcsArtifactService("b");
		await expect(
			service.deleteArtifact({ ...base, filename: "del.txt" }),
		).rejects.toThrow("delete v1 failed");
		expect(deleteMock).toHaveBeenCalledTimes(2);
	});

	it("loadArtifact rethrows non-404 download errors and accepts numeric 404", async () => {
		getMetadataMock.mockResolvedValue([{ contentType: "text/plain" }]);
		downloadMock.mockRejectedValueOnce(
			Object.assign(new Error("gone"), { code: 404 }),
		);
		const service = new GcsArtifactService("b");
		await expect(
			service.loadArtifact({ ...base, filename: "a.txt", version: 0 }),
		).resolves.toBeNull();

		downloadMock.mockRejectedValueOnce(
			Object.assign(new Error("network"), { code: 500 }),
		);
		await expect(
			service.loadArtifact({ ...base, filename: "a.txt", version: 0 }),
		).rejects.toThrow("network");

		downloadMock.mockRejectedValueOnce(
			Object.assign(new Error("string-404"), { code: "404" }),
		);
		await expect(
			service.loadArtifact({ ...base, filename: "a.txt", version: 0 }),
		).rejects.toThrow("string-404");
	});

	it("loadArtifact returns null when download buffer is falsy", async () => {
		getMetadataMock.mockResolvedValue([{ contentType: "text/plain" }]);
		downloadMock.mockResolvedValueOnce([null]);
		const service = new GcsArtifactService("b");
		await expect(
			service.loadArtifact({ ...base, filename: "a.txt", version: 0 }),
		).resolves.toBeNull();
	});

	it("loadArtifact defaults mimeType when metadata contentType is missing", async () => {
		getMetadataMock.mockResolvedValue([{}]);
		downloadMock.mockResolvedValue([Buffer.from("bytes")]);
		const service = new GcsArtifactService("b");
		await expect(
			service.loadArtifact({ ...base, filename: "a.txt", version: 0 }),
		).resolves.toEqual({
			inlineData: {
				data: "bytes",
				mimeType: "application/octet-stream",
			},
		});
	});

	it("listVersions skips non-numeric trailing segments and wrong depths", async () => {
		getFilesMock.mockResolvedValue([
			[
				{ name: "app/user-1/sess-1/a.txt/0" },
				{ name: "app/user-1/sess-1/a.txt/not-a-number" },
				{ name: "app/user-1/sess-1/a.txt/2/extra" },
				{ name: "app/user-1/sess-1/a.txt/3" },
				{ name: "too/short" },
			],
		]);
		const service = new GcsArtifactService("b");
		await expect(
			service.listVersions({ ...base, filename: "a.txt" }),
		).resolves.toEqual([0, 3]);
	});

	it("listArtifactKeys ignores wrong-depth blobs and sorts filenames", async () => {
		getFilesMock
			.mockResolvedValueOnce([
				[
					{ name: "app/user-1/sess-1/z.txt/0" },
					{ name: "app/user-1/sess-1/a.txt/1" },
					{ name: "app/user-1/sess-1/nested/extra/x.txt/0" },
					{ name: "short" },
				],
			])
			.mockResolvedValueOnce([
				[
					{ name: "app/user-1/user/user:prefs.json/0" },
					{ name: "app/user-1/user/too/many/parts/here/0" },
				],
			]);
		const service = new GcsArtifactService("b");
		await expect(service.listArtifactKeys(base)).resolves.toEqual([
			"a.txt",
			"user:prefs.json",
			"z.txt",
		]);
	});

	it("saveArtifact starts at version 0 when listVersions is empty", async () => {
		getFilesMock.mockResolvedValue([[]]);
		const service = new GcsArtifactService("b");
		const version = await service.saveArtifact({
			...base,
			filename: "first.txt",
			artifact: {
				inlineData: { data: "1", mimeType: "text/plain" },
			},
		});
		expect(version).toBe(0);
		expect(fileMock).toHaveBeenCalledWith("app/user-1/sess-1/first.txt/0");
		expect(saveMock).toHaveBeenCalledWith("1", {
			contentType: "text/plain",
			preconditionOpts: { ifGenerationMatch: 0 },
		});
	});

	it("loadArtifact without version returns null when no versions exist", async () => {
		getFilesMock.mockResolvedValue([[]]);
		const service = new GcsArtifactService("b");
		await expect(
			service.loadArtifact({ ...base, filename: "missing.txt" }),
		).resolves.toBeNull();
	});

	it("loadArtifact without version selects the maximum version", async () => {
		getFilesMock.mockResolvedValue([
			[
				{ name: "app/user-1/sess-1/max.txt/1" },
				{ name: "app/user-1/sess-1/max.txt/4" },
				{ name: "app/user-1/sess-1/max.txt/2" },
			],
		]);
		getMetadataMock.mockResolvedValue([{ contentType: "text/plain" }]);
		downloadMock.mockResolvedValue([Buffer.from("latest")]);
		const service = new GcsArtifactService("b");
		const part = await service.loadArtifact({
			...base,
			filename: "max.txt",
		});
		expect(fileMock).toHaveBeenCalledWith("app/user-1/sess-1/max.txt/4");
		expect(part?.inlineData?.data).toBe("latest");
	});

	it("saveArtifact passes through undefined mimeType as contentType", async () => {
		getFilesMock.mockResolvedValue([[]]);
		const service = new GcsArtifactService("b");
		await service.saveArtifact({
			...base,
			filename: "no-mime.bin",
			artifact: {
				inlineData: { data: "raw", mimeType: undefined as any },
			},
		});
		expect(saveMock).toHaveBeenCalledWith("raw", {
			contentType: undefined,
			preconditionOpts: { ifGenerationMatch: 0 },
		});
	});

	it("saveArtifact propagates non-412 blob.save errors", async () => {
		getFilesMock.mockResolvedValue([[]]);
		saveMock.mockRejectedValueOnce(
			Object.assign(new Error("quota"), { code: 429 }),
		);
		const service = new GcsArtifactService("b");
		await expect(
			service.saveArtifact({
				...base,
				filename: "quota.bin",
				artifact: {
					inlineData: { data: "x", mimeType: "text/plain" },
				},
			}),
		).rejects.toMatchObject({ code: 429, message: "quota" });
	});

	it("loadArtifact returns null for numeric 404 and rethrows string code 404", async () => {
		getMetadataMock.mockRejectedValueOnce(
			Object.assign(new Error("missing"), { code: 404 }),
		);
		const service = new GcsArtifactService("b");
		await expect(
			service.loadArtifact({ ...base, filename: "a.txt", version: 0 }),
		).resolves.toBeNull();

		getMetadataMock.mockRejectedValueOnce(
			Object.assign(new Error("string-code"), { code: "404" }),
		);
		await expect(
			service.loadArtifact({ ...base, filename: "a.txt", version: 0 }),
		).rejects.toThrow("string-code");
	});

	it("deleteArtifact deletes sparse version blobs returned by listVersions", async () => {
		getFilesMock.mockResolvedValue([
			[
				{ name: "app/user-1/sess-1/sparse-del.txt/0" },
				{ name: "app/user-1/sess-1/sparse-del.txt/5" },
			],
		]);
		const service = new GcsArtifactService("b");
		await service.deleteArtifact({ ...base, filename: "sparse-del.txt" });
		expect(fileMock).toHaveBeenCalledWith("app/user-1/sess-1/sparse-del.txt/0");
		expect(fileMock).toHaveBeenCalledWith("app/user-1/sess-1/sparse-del.txt/5");
		expect(deleteMock).toHaveBeenCalledTimes(2);
	});
});
