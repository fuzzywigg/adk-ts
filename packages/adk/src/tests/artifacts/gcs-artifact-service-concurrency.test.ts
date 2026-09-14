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

describe("GcsArtifactService concurrency / overwrite races", () => {
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

	it("concurrent saveArtifact against empty listing both target version 0 (overwrite race)", async () => {
		getFilesMock.mockResolvedValue([[]]);
		let saveCalls = 0;
		saveMock.mockImplementation(async () => {
			saveCalls += 1;
			if (saveCalls === 2) {
				throw Object.assign(new Error("precondition failed"), { code: 412 });
			}
		});

		const service = new GcsArtifactService("b");
		const results = await Promise.allSettled([
			service.saveArtifact({
				...base,
				filename: "race.txt",
				artifact: {
					inlineData: { data: "first", mimeType: "text/plain" },
				},
			}),
			service.saveArtifact({
				...base,
				filename: "race.txt",
				artifact: {
					inlineData: { data: "second", mimeType: "text/plain" },
				},
			}),
		]);

		const fulfilled = results.filter((r) => r.status === "fulfilled");
		const rejected = results.filter((r) => r.status === "rejected");
		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect((fulfilled[0] as PromiseFulfilledResult<number>).value).toBe(0);
		expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
			code: 412,
		});

		expect(
			fileMock.mock.calls.filter(
				(c) => c[0] === "app/user-1/sess-1/race.txt/0",
			),
		).toHaveLength(2);
		expect(saveMock).toHaveBeenCalledTimes(2);
		for (const call of saveMock.mock.calls) {
			expect(call[1]).toEqual(
				expect.objectContaining({
					preconditionOpts: { ifGenerationMatch: 0 },
				}),
			);
		}
	});

	it("concurrent put/get: parallel loads of missing keys all return null", async () => {
		getFilesMock.mockResolvedValue([[]]);
		const service = new GcsArtifactService("b");

		const results = await Promise.all(
			Array.from({ length: 12 }, (_, i) =>
				service.loadArtifact({
					...base,
					filename: `missing-${i}.txt`,
				}),
			),
		);

		expect(results.every((r) => r === null)).toBe(true);
		expect(getFilesMock).toHaveBeenCalled();
		expect(downloadMock).not.toHaveBeenCalled();
	});

	it("concurrent put then get returns the written payload", async () => {
		getFilesMock.mockResolvedValue([[]]);
		const service = new GcsArtifactService("b");

		const put = service.saveArtifact({
			...base,
			filename: "note.txt",
			artifact: {
				inlineData: { data: "hello", mimeType: "text/plain" },
			},
		});

		getMetadataMock.mockResolvedValue([{ contentType: "text/plain" }]);
		downloadMock.mockResolvedValue([Buffer.from("hello")]);

		const [version, loadedExplicit] = await Promise.all([
			put,
			service.loadArtifact({
				...base,
				filename: "note.txt",
				version: 0,
			}),
		]);

		expect(version).toBe(0);
		expect(loadedExplicit).toEqual({
			inlineData: { data: "hello", mimeType: "text/plain" },
		});
	});

	it("concurrent overwrite race when listVersions returns the same max", async () => {
		getFilesMock.mockResolvedValue([[{ name: "app/user-1/sess-1/ow.txt/0" }]]);
		let saves = 0;
		saveMock.mockImplementation(async () => {
			saves += 1;
			if (saves > 1) {
				throw Object.assign(new Error("already exists"), { code: 412 });
			}
		});

		const service = new GcsArtifactService("b");
		const settled = await Promise.allSettled([
			service.saveArtifact({
				...base,
				filename: "ow.txt",
				artifact: {
					inlineData: { data: "a", mimeType: "text/plain" },
				},
			}),
			service.saveArtifact({
				...base,
				filename: "ow.txt",
				artifact: {
					inlineData: { data: "b", mimeType: "text/plain" },
				},
			}),
			service.saveArtifact({
				...base,
				filename: "ow.txt",
				artifact: {
					inlineData: { data: "c", mimeType: "text/plain" },
				},
			}),
		]);

		const ok = settled.filter((r) => r.status === "fulfilled");
		const fail = settled.filter((r) => r.status === "rejected");
		expect(ok).toHaveLength(1);
		expect(fail).toHaveLength(2);
		expect((ok[0] as PromiseFulfilledResult<number>).value).toBe(1);
		for (const call of fileMock.mock.calls) {
			if (String(call[0]).endsWith("/1")) {
				expect(call[0]).toBe("app/user-1/sess-1/ow.txt/1");
			}
		}
		expect(saveMock).toHaveBeenCalledTimes(3);
	});

	it("concurrent listArtifactKeys for empty prefixes returns missing-key empty arrays", async () => {
		getFilesMock.mockResolvedValue([[]]);
		const service = new GcsArtifactService("b");

		const keys = await Promise.all([
			service.listArtifactKeys(base),
			service.listArtifactKeys(base),
			service.listArtifactKeys({
				appName: "other",
				userId: "u",
				sessionId: "s",
			}),
		]);

		expect(keys).toEqual([[], [], []]);
		expect(getFilesMock.mock.calls.length).toBeGreaterThanOrEqual(6);
	});

	it("concurrent listVersions for missing artifact keys return empty", async () => {
		getFilesMock.mockResolvedValue([[]]);
		const service = new GcsArtifactService("b");

		const versions = await Promise.all([
			service.listVersions({ ...base, filename: "ghost.txt" }),
			service.listVersions({ ...base, filename: "also-ghost.txt" }),
			service.listVersions({ ...base, filename: "user:ghost.json" }),
		]);

		expect(versions).toEqual([[], [], []]);
	});

	it("loadArtifact tolerates large metadata stubs and only uses contentType", async () => {
		const largeStub: Record<string, unknown> = {
			contentType: "application/json",
			size: "999999999",
			etag: "e".repeat(4096),
			md5Hash: "m".repeat(1024),
			crc32c: "c".repeat(256),
			customTime: new Date().toISOString(),
			metadata: Object.fromEntries(
				Array.from({ length: 200 }, (_, i) => [
					`k-${i}`,
					`v-${"x".repeat(64)}-${i}`,
				]),
			),
			owner: { entity: "user-1", entityId: "z".repeat(512) },
			acl: Array.from({ length: 50 }, (_, i) => ({
				role: "READER",
				entity: `user-${i}`,
			})),
		};

		getMetadataMock.mockResolvedValue([largeStub]);
		downloadMock.mockResolvedValue([
			Buffer.from(`{"ok":true,"pad":"${"y".repeat(8000)}"}`),
		]);

		const service = new GcsArtifactService("b");
		const parts = await Promise.all(
			Array.from({ length: 6 }, () =>
				service.loadArtifact({
					...base,
					filename: "fat.json",
					version: 0,
				}),
			),
		);

		for (const part of parts) {
			expect(part?.inlineData?.mimeType).toBe("application/json");
			expect(part?.inlineData?.data?.startsWith('{"ok":true')).toBe(true);
			expect(part?.inlineData?.data?.length).toBeGreaterThan(8000);
		}
		expect(getMetadataMock).toHaveBeenCalledTimes(6);
	});

	it("large metadata stub without contentType defaults mime under concurrent loads", async () => {
		const stub = {
			etag: "E".repeat(8192),
			metadata: { note: "n".repeat(4096) },
		};
		getMetadataMock.mockResolvedValue([stub]);
		downloadMock.mockResolvedValue([Buffer.from("bytes")]);

		const service = new GcsArtifactService("b");
		const [a, b] = await Promise.all([
			service.loadArtifact({ ...base, filename: "x.bin", version: 3 }),
			service.loadArtifact({ ...base, filename: "x.bin", version: 3 }),
		]);

		expect(a).toEqual({
			inlineData: {
				data: "bytes",
				mimeType: "application/octet-stream",
			},
		});
		expect(b).toEqual(a);
	});

	it("concurrent deleteArtifact of missing keys is a no-op", async () => {
		getFilesMock.mockResolvedValue([[]]);
		const service = new GcsArtifactService("b");

		await Promise.all([
			service.deleteArtifact({ ...base, filename: "gone.txt" }),
			service.deleteArtifact({ ...base, filename: "gone.txt" }),
			service.deleteArtifact({ ...base, filename: "user:gone.json" }),
		]);

		expect(deleteMock).not.toHaveBeenCalled();
	});

	it("concurrent user-namespace saves both race on version 0 with ifGenerationMatch", async () => {
		getFilesMock.mockResolvedValue([[]]);
		let n = 0;
		saveMock.mockImplementation(async () => {
			n += 1;
			if (n === 2) {
				throw Object.assign(new Error("412"), { code: 412 });
			}
		});

		const service = new GcsArtifactService("b");
		const settled = await Promise.allSettled([
			service.saveArtifact({
				...base,
				filename: "user:profile.json",
				artifact: {
					inlineData: { data: "{}", mimeType: "application/json" },
				},
			}),
			service.saveArtifact({
				...base,
				filename: "user:profile.json",
				artifact: {
					inlineData: { data: '{"a":1}', mimeType: "application/json" },
				},
			}),
		]);

		expect(settled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		expect(settled.filter((r) => r.status === "rejected")).toHaveLength(1);
		expect(fileMock).toHaveBeenCalledWith(
			"app/user-1/user/user:profile.json/0",
		);
		expect(saveMock).toHaveBeenCalledWith("{}", {
			contentType: "application/json",
			preconditionOpts: { ifGenerationMatch: 0 },
		});
	});

	it("mixed concurrent listVersions + loadArtifact on missing keys stay null/empty", async () => {
		getFilesMock.mockResolvedValue([[]]);
		getMetadataMock.mockRejectedValue(
			Object.assign(new Error("not found"), { code: 404 }),
		);
		const service = new GcsArtifactService("b");

		const [versions, latest, explicit, keys] = await Promise.all([
			service.listVersions({ ...base, filename: "nope.txt" }),
			service.loadArtifact({ ...base, filename: "nope.txt" }),
			service.loadArtifact({ ...base, filename: "nope.txt", version: 99 }),
			service.listArtifactKeys(base),
		]);

		expect(versions).toEqual([]);
		expect(latest).toBeNull();
		expect(explicit).toBeNull();
		expect(keys).toEqual([]);
	});
});
