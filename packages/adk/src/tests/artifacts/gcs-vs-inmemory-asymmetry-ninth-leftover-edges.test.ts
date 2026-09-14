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
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

describe("GCS vs InMemory negative-version / empty asymmetry ninth leftover", () => {
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

	it("InMemory -1 wraps to latest; GCS -1 requests literal blob …/-1", async () => {
		const memory = new InMemoryArtifactService();
		await memory.saveArtifact({
			...base,
			filename: "n.txt",
			artifact: { text: "v0" },
		});
		await memory.saveArtifact({
			...base,
			filename: "n.txt",
			artifact: { text: "v1" },
		});
		await expect(
			memory.loadArtifact({ ...base, filename: "n.txt", version: -1 }),
		).resolves.toEqual({ text: "v1" });

		getMetadataMock.mockRejectedValue(
			Object.assign(new Error("404"), { code: 404 }),
		);
		const gcs = new GcsArtifactService("bucket");
		await expect(
			gcs.loadArtifact({ ...base, filename: "n.txt", version: -1 }),
		).resolves.toBeNull();
		expect(fileMock).toHaveBeenCalledWith("app/uid/s1/n.txt/-1");
	});

	it("InMemory empty inlineData+no text → null; GCS empty Buffer stays truthy payload", async () => {
		const memory = new InMemoryArtifactService();
		await memory.saveArtifact({
			...base,
			filename: "empty.txt",
			artifact: {
				inlineData: { data: "", mimeType: "text/plain" },
			},
		});
		await expect(
			memory.loadArtifact({ ...base, filename: "empty.txt" }),
		).resolves.toBeNull();

		getMetadataMock.mockResolvedValue([{ contentType: "text/plain" }]);
		downloadMock.mockResolvedValue([Buffer.from("")]);
		const gcs = new GcsArtifactService("bucket");
		const part = await gcs.loadArtifact({
			...base,
			filename: "empty.txt",
			version: 0,
		});
		expect(part?.inlineData.data).toBe("");
		expect(part?.inlineData.mimeType).toBe("text/plain");
	});

	it("InMemory lists nested slash filenames; GCS listArtifactKeys drops them", async () => {
		const memory = new InMemoryArtifactService();
		await memory.saveArtifact({
			...base,
			filename: "nested/path.txt",
			artifact: { text: "n" },
		});
		await expect(memory.listArtifactKeys(base)).resolves.toEqual([
			"nested/path.txt",
		]);

		getFilesMock
			.mockResolvedValueOnce([[{ name: "app/uid/s1/nested/path.txt/0" }]])
			.mockResolvedValueOnce([[]]);
		const gcs = new GcsArtifactService("bucket");
		await expect(gcs.listArtifactKeys(base)).resolves.toEqual([]);
	});
});
