import { beforeEach, describe, expect, it, vi } from "vitest";

const { saveMock, getFilesMock, fileMock, bucketMock, StorageMock } =
	vi.hoisted(() => {
		const saveMock = vi.fn().mockResolvedValue(undefined);
		const getFilesMock = vi.fn();
		const fileMock = vi.fn(() => ({
			save: saveMock,
		}));
		const bucketMock = vi.fn(() => ({
			file: fileMock,
			getFiles: getFilesMock,
		}));
		const StorageMock = vi.fn(function Storage(this: any) {
			this.bucket = bucketMock;
		});
		return { saveMock, getFilesMock, fileMock, bucketMock, StorageMock };
	});

vi.mock("@google-cloud/storage", () => ({
	Storage: StorageMock,
}));

import { GcsArtifactService } from "../../artifacts/gcs-artifact-service";

describe("GcsArtifactService leftover: slash-depth listVersions empty → perpetual save v0", () => {
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
		fileMock.mockImplementation(() => ({ save: saveMock }));
		saveMock.mockResolvedValue(undefined);
	});

	it("repeated saveArtifact for slash filename always returns version 0", async () => {
		const filename = "user:nested/path.bin";
		const existing = "app/user-1/user/user:nested/path.bin/0";
		getFilesMock.mockResolvedValue([[{ name: existing }]]);
		const service = new GcsArtifactService("bucket");

		const v1 = await service.saveArtifact({
			...base,
			filename,
			artifact: { inlineData: { data: "a", mimeType: "text/plain" } },
		});
		const v2 = await service.saveArtifact({
			...base,
			filename,
			artifact: { inlineData: { data: "b", mimeType: "text/plain" } },
		});
		const v3 = await service.saveArtifact({
			...base,
			filename,
			artifact: { inlineData: { data: "c", mimeType: "text/plain" } },
		});

		expect([v1, v2, v3]).toEqual([0, 0, 0]);
		expect(fileMock).toHaveBeenCalledWith(
			"app/user-1/user/user:nested/path.bin/0",
		);
		expect(saveMock).toHaveBeenCalledTimes(3);
		for (const call of saveMock.mock.calls) {
			expect(call[1]).toEqual({
				contentType: "text/plain",
				preconditionOpts: { ifGenerationMatch: 0 },
			});
		}
	});

	it("session slash filename also stuck at v0 despite prior blob", async () => {
		getFilesMock.mockResolvedValue([
			[{ name: "app/user-1/sess-1/nested/path.bin/0" }],
		]);
		const service = new GcsArtifactService("bucket");
		await expect(
			service.saveArtifact({
				...base,
				filename: "nested/path.bin",
				artifact: { inlineData: { data: "x", mimeType: "text/plain" } },
			}),
		).resolves.toBe(0);
		expect(fileMock).toHaveBeenCalledWith(
			"app/user-1/sess-1/nested/path.bin/0",
		);
	});
});
