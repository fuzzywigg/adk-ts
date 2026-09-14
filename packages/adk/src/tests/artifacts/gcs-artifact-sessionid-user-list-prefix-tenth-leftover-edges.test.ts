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
 * Tenth leftover: sessionId === "user" makes sessionPrefix === userNamespacePrefix.
 * GCS lists the same prefix twice; Set dedupes filenames (unlike InMemory else-if).
 */
describe("GcsArtifactService sessionId=user list prefix tenth leftover", () => {
	const base = {
		appName: "app",
		userId: "uid",
		sessionId: "user",
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

	it("both getFiles prefixes are app/uid/user/ when sessionId is user", async () => {
		getFilesMock.mockResolvedValue([[]]);
		const service = new GcsArtifactService("bucket");
		await service.listArtifactKeys(base);
		expect(getFilesMock).toHaveBeenCalledTimes(2);
		expect(getFilesMock).toHaveBeenNthCalledWith(1, {
			prefix: "app/uid/user/",
		});
		expect(getFilesMock).toHaveBeenNthCalledWith(2, {
			prefix: "app/uid/user/",
		});
	});

	it("duplicate blobs from the double prefix list are Set-deduped", async () => {
		const blobs = [
			{ name: "app/uid/user/note.txt/0" },
			{ name: "app/uid/user/user:ns.txt/0" },
		];
		getFilesMock.mockResolvedValueOnce([blobs]).mockResolvedValueOnce([blobs]);
		const service = new GcsArtifactService("bucket");
		await expect(service.listArtifactKeys(base)).resolves.toEqual([
			"note.txt",
			"user:ns.txt",
		]);
	});

	it("sessionId User (case) does not collide with user namespace prefix", async () => {
		getFilesMock.mockResolvedValue([[]]);
		const service = new GcsArtifactService("bucket");
		await service.listArtifactKeys({
			appName: "app",
			userId: "uid",
			sessionId: "User",
		});
		expect(getFilesMock).toHaveBeenNthCalledWith(1, {
			prefix: "app/uid/User/",
		});
		expect(getFilesMock).toHaveBeenNthCalledWith(2, {
			prefix: "app/uid/user/",
		});
	});

	it("delete with empty version list is a no-op Promise.all([])", async () => {
		getFilesMock.mockResolvedValue([[]]);
		const service = new GcsArtifactService("bucket");
		await expect(
			service.deleteArtifact({ ...base, filename: "missing.txt" }),
		).resolves.toBeUndefined();
		expect(deleteMock).not.toHaveBeenCalled();
	});

	it("save under sessionId=user still writes the session path (not user-ns unless user: file)", async () => {
		getFilesMock.mockResolvedValue([[]]);
		const service = new GcsArtifactService("bucket");
		await service.saveArtifact({
			...base,
			filename: "plain.txt",
			artifact: { inlineData: { data: "x", mimeType: "text/plain" } },
		});
		expect(fileMock).toHaveBeenCalledWith("app/uid/user/plain.txt/0");
	});
});
