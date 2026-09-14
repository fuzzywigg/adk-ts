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

describe("GcsArtifactService user: namespace case-sensitivity fifth leftover", () => {
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
		getFilesMock.mockResolvedValue([[]]);
	});

	it.each([
		{
			filename: "user:profile.json",
			expected: "app/user-1/user/user:profile.json/0",
			ns: true,
		},
		{
			filename: "USER:profile.json",
			expected: "app/user-1/sess-1/USER:profile.json/0",
			ns: false,
		},
		{
			filename: "User:profile.json",
			expected: "app/user-1/sess-1/User:profile.json/0",
			ns: false,
		},
		{
			filename: "userProfile.json",
			expected: "app/user-1/sess-1/userProfile.json/0",
			ns: false,
		},
		{
			filename: " user:x.txt",
			expected: "app/user-1/sess-1/ user:x.txt/0",
			ns: false,
		},
		{
			filename: "users:x.txt",
			expected: "app/user-1/sess-1/users:x.txt/0",
			ns: false,
		},
	])("startsWith('user:') case trap for $filename", async ({
		filename,
		expected,
	}) => {
		const service = new GcsArtifactService("bucket");
		await service.saveArtifact({
			...base,
			filename,
			artifact: { inlineData: { data: "x", mimeType: "text/plain" } },
		});
		expect(fileMock).toHaveBeenCalledWith(expected);
	});

	it("listVersions prefix follows same case-sensitive namespace gate", async () => {
		const service = new GcsArtifactService("bucket");
		await service.listVersions({ ...base, filename: "USER:note.txt" });
		expect(getFilesMock).toHaveBeenCalledWith({
			prefix: "app/user-1/sess-1/USER:note.txt/",
		});
		await service.listVersions({ ...base, filename: "user:note.txt" });
		expect(getFilesMock).toHaveBeenCalledWith({
			prefix: "app/user-1/user/user:note.txt/",
		});
	});
});
