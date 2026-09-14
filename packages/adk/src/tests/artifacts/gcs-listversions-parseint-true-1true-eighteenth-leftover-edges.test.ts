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
 * Eighteenth leftover: `Number.parseInt(versionStr, 10)` then `!Number.isNaN`.
 * Sixteenth pins `"0false"` → 0 keep / `"false"` drop. `"true"` is full-NaN
 * drop; `"1true"` is partial-numeric keep (leading digit).
 */
describe("GcsArtifactService listVersions parseInt true / 1true eighteenth leftover", () => {
	const base = {
		appName: "app",
		userId: "user-1",
		sessionId: "sess-1",
		filename: "note.txt",
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
	});

	it('listVersions drops full-NaN "true" segment', async () => {
		expect(Number.isNaN(Number.parseInt("true", 10))).toBe(true);
		getFilesMock.mockResolvedValue([
			[{ name: "app/user-1/sess-1/note.txt/true" }],
		]);
		const service = new GcsArtifactService("bucket");
		await expect(service.listVersions(base)).resolves.toEqual([]);
	});

	it('listVersions keeps partial-numeric "1true" → 1', async () => {
		expect(Number.parseInt("1true", 10)).toBe(1);
		getFilesMock.mockResolvedValue([
			[{ name: "app/user-1/sess-1/note.txt/1true" }],
		]);
		const service = new GcsArtifactService("bucket");
		await expect(service.listVersions(base)).resolves.toEqual([1]);
	});

	it('listVersions drops "true1" (no leading digit)', async () => {
		expect(Number.isNaN(Number.parseInt("true1", 10))).toBe(true);
		getFilesMock.mockResolvedValue([
			[{ name: "app/user-1/sess-1/note.txt/true1" }],
		]);
		const service = new GcsArtifactService("bucket");
		await expect(service.listVersions(base)).resolves.toEqual([]);
	});

	it('string "false" still dropped (sixteenth control)', async () => {
		getFilesMock.mockResolvedValue([
			[{ name: "app/user-1/sess-1/note.txt/false" }],
		]);
		const service = new GcsArtifactService("bucket");
		await expect(service.listVersions(base)).resolves.toEqual([]);
	});
});
