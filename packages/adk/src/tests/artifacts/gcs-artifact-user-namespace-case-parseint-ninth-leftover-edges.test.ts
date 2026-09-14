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

describe("GcsArtifactService USER: case + parseInt ninth leftover (post #164)", () => {
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
	});

	it.each([
		{
			filename: "USER:profile.json",
			blob: "app/user-1/sess-1/USER:profile.json/0",
			label: "uppercase USER:",
		},
		{
			filename: "User:profile.json",
			blob: "app/user-1/sess-1/User:profile.json/0",
			label: "mixed User:",
		},
		{
			filename: "userprofile.json",
			blob: "app/user-1/sess-1/userprofile.json/0",
			label: "missing colon",
		},
		{
			filename: "xuser:y.txt",
			blob: "app/user-1/sess-1/xuser:y.txt/0",
			label: "near-miss xuser:",
		},
		{
			filename: " user:y.txt",
			blob: "app/user-1/sess-1/ user:y.txt/0",
			label: "leading whitespace before user:",
		},
	])("fileHasUserNamespace case/near-miss $label takes session path", async ({
		filename,
		blob,
	}) => {
		getFilesMock.mockResolvedValue([[]]);
		const service = new GcsArtifactService("bucket");
		await service.saveArtifact({
			...base,
			filename,
			artifact: { inlineData: { data: "x", mimeType: "text/plain" } },
		});
		expect(fileMock).toHaveBeenCalledWith(blob);
		expect(fileMock).not.toHaveBeenCalledWith(
			expect.stringContaining("/user/USER:"),
		);
	});

	it("lowercase user: still routes to user namespace", async () => {
		getFilesMock.mockResolvedValue([[]]);
		const service = new GcsArtifactService("bucket");
		await service.saveArtifact({
			...base,
			filename: "user:ok.txt",
			artifact: { inlineData: { data: "x", mimeType: "text/plain" } },
		});
		expect(fileMock).toHaveBeenCalledWith("app/user-1/user/user:ok.txt/0");
	});

	it.each([
		{ versionStr: "08", expected: 8 },
		{ versionStr: "10abc", expected: 10 },
		{ versionStr: "+3", expected: 3 },
		{ versionStr: "7.9", expected: 7 },
		{ versionStr: "0x10", expected: 0 },
	])("listVersions Number.parseInt($versionStr) keeps partial numeric $expected", async ({
		versionStr,
		expected,
	}) => {
		getFilesMock.mockResolvedValue([
			[{ name: `app/user-1/sess-1/note.txt/${versionStr}` }],
		]);
		const service = new GcsArtifactService("bucket");
		await expect(
			service.listVersions({ ...base, filename: "note.txt" }),
		).resolves.toEqual([expected]);
	});

	it.each([
		"abc",
		"",
		"NaN",
		"--",
		" ",
	])("listVersions drops full-NaN version segment %j", async (versionStr) => {
		getFilesMock.mockResolvedValue([
			[{ name: `app/user-1/sess-1/note.txt/${versionStr}` }],
		]);
		const service = new GcsArtifactService("bucket");
		await expect(
			service.listVersions({ ...base, filename: "note.txt" }),
		).resolves.toEqual([]);
	});

	it("loadArtifact version=-1 uses literal path …/-1 (no InMemory wrap)", async () => {
		getMetadataMock.mockRejectedValue(
			Object.assign(new Error("missing"), { code: 404 }),
		);
		const service = new GcsArtifactService("bucket");
		await expect(
			service.loadArtifact({ ...base, filename: "note.txt", version: -1 }),
		).resolves.toBeNull();
		expect(fileMock).toHaveBeenCalledWith("app/user-1/sess-1/note.txt/-1");
		expect(getFilesMock).not.toHaveBeenCalled();
	});
});
