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

describe("GcsArtifactService contentType empty-string || octet fifth leftover (post #165)", () => {
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
		downloadMock.mockResolvedValue([Buffer.from("blob")]);
	});

	it.each([
		{ label: '""', contentType: "" },
		{ label: "null", contentType: null },
		{ label: "undefined", contentType: undefined },
		{ label: "missing key", contentType: undefined, omit: true },
	] as const)("loadArtifact mimeType defaults to application/octet-stream when contentType is falsy ($label)", async ({
		contentType,
		omit,
	}) => {
		getMetadataMock.mockResolvedValue([
			omit ? {} : { contentType: contentType as any },
		]);
		const service = new GcsArtifactService("bucket");
		const part = await service.loadArtifact({
			...base,
			filename: "note.txt",
			version: 0,
		});
		expect(part?.inlineData.mimeType).toBe("application/octet-stream");
	});

	it("keeps truthy contentType including whitespace-only (|| only falsy)", async () => {
		getMetadataMock.mockResolvedValue([{ contentType: "   " }]);
		const service = new GcsArtifactService("bucket");
		const part = await service.loadArtifact({
			...base,
			filename: "note.txt",
			version: 0,
		});
		expect(part?.inlineData.mimeType).toBe("   ");
	});

	it.each([
		{ label: "null version", version: null },
		{ label: "undefined version", version: undefined },
	] as const)("loadArtifact $label selects Math.max latest version", async ({
		version,
	}) => {
		getFilesMock.mockResolvedValue([
			[
				{ name: "app/user-1/sess-1/note.txt/0" },
				{ name: "app/user-1/sess-1/note.txt/2" },
				{ name: "app/user-1/sess-1/note.txt/1" },
			],
		]);
		getMetadataMock.mockResolvedValue([{ contentType: "text/plain" }]);
		const service = new GcsArtifactService("bucket");
		await service.loadArtifact({
			...base,
			filename: "note.txt",
			version: version as any,
		});
		expect(fileMock).toHaveBeenCalledWith("app/user-1/sess-1/note.txt/2");
	});

	it("saveArtifact first version is 0 when listVersions empty", async () => {
		getFilesMock.mockResolvedValue([[]]);
		const service = new GcsArtifactService("bucket");
		const version = await service.saveArtifact({
			...base,
			filename: "fresh.txt",
			artifact: { inlineData: { data: "x", mimeType: "text/plain" } },
		});
		expect(version).toBe(0);
		expect(fileMock).toHaveBeenCalledWith("app/user-1/sess-1/fresh.txt/0");
	});

	it("listArtifactKeys skips blob paths whose split length !== 5", async () => {
		getFilesMock
			.mockResolvedValueOnce([
				[
					{ name: "app/user-1/sess-1/ok.txt/0" },
					{ name: "app/user-1/sess-1/too/deep/file.txt/0" },
					{ name: "short" },
				],
			])
			.mockResolvedValueOnce([
				[{ name: "app/user-1/user/user:profile.json/0" }],
			]);
		const service = new GcsArtifactService("bucket");
		await expect(service.listArtifactKeys(base)).resolves.toEqual([
			"ok.txt",
			"user:profile.json",
		]);
	});
});
