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
 * Sixteenth leftover: `Number.parseInt(versionStr, 10)` then `!Number.isNaN`.
 * Ninth covers `"10abc"` → 10 and `"abc"` NaN-drop; fourteenth whitespace.
 * `"0false"` partial-parses to 0; bare `"false"` → NaN drop.
 */
describe("GcsArtifactService listVersions parseInt zero-false partial sixteenth leftover", () => {
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
	});

	it('segment "0false" parseInt → 0 and is kept', async () => {
		expect(Number.parseInt("0false", 10)).toBe(0);
		getFilesMock.mockResolvedValue([
			[{ name: "app/user-1/sess-1/note.txt/0false" }],
		]);
		const service = new GcsArtifactService("bucket");
		await expect(
			service.listVersions({ ...base, filename: "note.txt" }),
		).resolves.toEqual([0]);
	});

	it('segment "false" parseInt → NaN and is dropped', async () => {
		expect(Number.isNaN(Number.parseInt("false", 10))).toBe(true);
		getFilesMock.mockResolvedValue([
			[{ name: "app/user-1/sess-1/note.txt/false" }],
		]);
		const service = new GcsArtifactService("bucket");
		await expect(
			service.listVersions({ ...base, filename: "note.txt" }),
		).resolves.toEqual([]);
	});

	it('segment "10abc" still partial-parses (ninth control)', async () => {
		getFilesMock.mockResolvedValue([
			[{ name: "app/user-1/sess-1/note.txt/10abc" }],
		]);
		const service = new GcsArtifactService("bucket");
		await expect(
			service.listVersions({ ...base, filename: "note.txt" }),
		).resolves.toEqual([10]);
	});
});
