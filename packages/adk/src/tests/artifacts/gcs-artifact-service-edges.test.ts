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

describe("GcsArtifactService leftover edges (post #113)", () => {
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

	it("rejects deleteArtifact when a later version delete fails", async () => {
		getFilesMock.mockResolvedValue([
			[
				{ name: "app/user-1/sess-1/note.txt/0" },
				{ name: "app/user-1/sess-1/note.txt/1" },
			],
		]);
		deleteMock
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error("delete denied"));
		const service = new GcsArtifactService("b");
		await expect(
			service.deleteArtifact({ ...base, filename: "note.txt" }),
		).rejects.toThrow(/delete denied/);
	});

	it("loadArtifact rethrows non-404 errors from getMetadata", async () => {
		getMetadataMock.mockRejectedValueOnce(
			Object.assign(new Error("forbidden"), { code: 403 }),
		);
		const service = new GcsArtifactService("b");
		await expect(
			service.loadArtifact({ ...base, filename: "note.txt", version: 0 }),
		).rejects.toThrow(/forbidden/);
	});

	it("loadArtifact rethrows string-coded errors that are not 404", async () => {
		getMetadataMock.mockRejectedValueOnce(
			Object.assign(new Error("rate limited"), { code: "RATE_LIMIT" }),
		);
		const service = new GcsArtifactService("b");
		await expect(
			service.loadArtifact({ ...base, filename: "note.txt", version: 0 }),
		).rejects.toThrow(/rate limited/);
	});

	it("listVersions skips blob names that are not 5-segment paths", async () => {
		getFilesMock.mockResolvedValue([
			[
				{ name: "app/user-1/sess-1/note.txt/0" },
				{ name: "app/user-1/sess-1/note.txt/bad/extra" },
				{ name: "app/user-1/sess-1/note.txt/not-a-number" },
				{ name: "app/user-1/sess-1/note.txt/2" },
			],
		]);
		const service = new GcsArtifactService("b");
		await expect(
			service.listVersions({ ...base, filename: "note.txt" }),
		).resolves.toEqual([0, 2]);
	});

	it("listArtifactKeys ignores blobs that are not exactly 5 path segments", async () => {
		getFilesMock
			.mockResolvedValueOnce([
				[
					{ name: "app/user-1/sess-1/ok.txt/0" },
					{ name: "app/user-1/sess-1/short" },
					{ name: "app/user-1/sess-1/nested/dir/file.txt/0" },
				],
			])
			.mockResolvedValueOnce([[]]);
		const service = new GcsArtifactService("b");
		await expect(service.listArtifactKeys(base)).resolves.toEqual(["ok.txt"]);
	});

	it("saveArtifact propagates listVersions failures before writing", async () => {
		getFilesMock.mockRejectedValueOnce(new Error("cannot list"));
		const service = new GcsArtifactService("b");
		await expect(
			service.saveArtifact({
				...base,
				filename: "blocked.txt",
				artifact: {
					inlineData: { data: "x", mimeType: "text/plain" },
				},
			}),
		).rejects.toThrow(/cannot list/);
		expect(saveMock).not.toHaveBeenCalled();
	});

	it("listArtifactKeys calls getFiles twice for session and user prefixes", async () => {
		getFilesMock
			.mockResolvedValueOnce([[]])
			.mockResolvedValueOnce([[{ name: "app/user-1/user/user:p.json/0" }]]);
		const service = new GcsArtifactService("b");
		await expect(service.listArtifactKeys(base)).resolves.toEqual([
			"user:p.json",
		]);
		expect(getFilesMock).toHaveBeenCalledTimes(2);
	});

	it("listVersions skips non-numeric trailing segments", async () => {
		getFilesMock.mockResolvedValueOnce([
			[
				{ name: "app/user-1/session-1/notes.txt/0" },
				{ name: "app/user-1/session-1/notes.txt/latest" },
				{ name: "app/user-1/session-1/notes.txt/2" },
			],
		]);
		const service = new GcsArtifactService("b");
		await expect(
			service.listVersions({ ...base, filename: "notes.txt" }),
		).resolves.toEqual([0, 2]);
	});

	it("deleteArtifact is a no-op when listVersions is empty", async () => {
		getFilesMock.mockResolvedValueOnce([[]]);
		const service = new GcsArtifactService("b");
		await expect(
			service.deleteArtifact({ ...base, filename: "gone.txt" }),
		).resolves.toBeUndefined();
		expect(deleteMock).not.toHaveBeenCalled();
	});

	it("saveArtifact uses user-namespace blob paths for user: filenames", async () => {
		getFilesMock.mockResolvedValueOnce([[]]);
		const service = new GcsArtifactService("b");
		await expect(
			service.saveArtifact({
				...base,
				filename: "user:prefs.json",
				artifact: {
					inlineData: { data: "{}", mimeType: "application/json" },
				},
			}),
		).resolves.toBe(0);
		expect(fileMock).toHaveBeenCalledWith("app/user-1/user/user:prefs.json/0");
	});
});
