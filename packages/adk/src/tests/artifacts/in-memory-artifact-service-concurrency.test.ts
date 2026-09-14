import { describe, expect, it } from "vitest";
import { getArtifactUri } from "../../artifacts/artifact-util";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

describe("InMemoryArtifactService concurrency / store races", () => {
	const base = {
		appName: "app",
		userId: "user-1",
		sessionId: "session-1",
	};

	it("concurrent saveArtifact on the same key yields unique sequential versions", async () => {
		const service = new InMemoryArtifactService();
		const n = 24;
		const versions = await Promise.all(
			Array.from({ length: n }, (_, i) =>
				service.saveArtifact({
					...base,
					filename: "race.txt",
					artifact: { text: `v-${i}` },
				}),
			),
		);

		expect(new Set(versions).size).toBe(n);
		expect(versions.sort((a, b) => a - b)).toEqual(
			Array.from({ length: n }, (_, i) => i),
		);
		expect(
			await service.listVersions({ ...base, filename: "race.txt" }),
		).toEqual(Array.from({ length: n }, (_, i) => i));
		expect(
			await service.loadArtifact({ ...base, filename: "race.txt" }),
		).not.toBeNull();
	});

	it("concurrent put then concurrent get returns stable versioned payloads", async () => {
		const service = new InMemoryArtifactService();
		const filenames = ["a.txt", "b.txt", "c.txt", "user:shared.txt"];

		const putVersions = await Promise.all(
			filenames.map((filename, i) =>
				service.saveArtifact({
					...base,
					filename,
					artifact: { text: `payload-${i}` },
				}),
			),
		);
		expect(putVersions.every((v) => v === 0)).toBe(true);

		const loaded = await Promise.all(
			filenames.map((filename) => service.loadArtifact({ ...base, filename })),
		);
		expect(loaded.map((p) => p?.text)).toEqual([
			"payload-0",
			"payload-1",
			"payload-2",
			"payload-3",
		]);
	});

	it("interleaved concurrent put/get on one key never returns undefined slots", async () => {
		const service = new InMemoryArtifactService();
		const ops: Promise<unknown>[] = [];

		for (let i = 0; i < 16; i++) {
			ops.push(
				service.saveArtifact({
					...base,
					filename: "interleave.txt",
					artifact: { text: `save-${i}` },
				}),
			);
			ops.push(
				service.loadArtifact({
					...base,
					filename: "interleave.txt",
				}),
			);
		}

		const results = await Promise.all(ops);
		const loads = results.filter((_, idx) => idx % 2 === 1) as Array<{
			text?: string;
		} | null>;

		for (const part of loads) {
			if (part !== null) {
				expect(part.text).toMatch(/^save-\d+$/);
			}
		}

		const versions = await service.listVersions({
			...base,
			filename: "interleave.txt",
		});
		expect(versions.length).toBe(16);
		expect(
			await service.loadArtifact({ ...base, filename: "interleave.txt" }),
		).toEqual({ text: expect.stringMatching(/^save-\d+$/) });
	});

	it("concurrent overwrite saves preserve every historical version", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "overwrite.txt",
			artifact: { text: "seed" },
		});

		const overwrites = await Promise.all(
			Array.from({ length: 10 }, (_, i) =>
				service.saveArtifact({
					...base,
					filename: "overwrite.txt",
					artifact: { text: `ow-${i}` },
				}),
			),
		);

		expect(overwrites).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
		expect(
			await service.listVersions({ ...base, filename: "overwrite.txt" }),
		).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
		expect(
			await service.loadArtifact({
				...base,
				filename: "overwrite.txt",
				version: 0,
			}),
		).toEqual({ text: "seed" });
	});

	it("concurrent loadArtifact for missing keys all return null", async () => {
		const service = new InMemoryArtifactService();
		const results = await Promise.all(
			Array.from({ length: 20 }, (_, i) =>
				service.loadArtifact({
					...base,
					filename: `missing-${i}.txt`,
				}),
			),
		);
		expect(results.every((r) => r === null)).toBe(true);
		expect(await service.listArtifactKeys(base)).toEqual([]);
	});

	it("concurrent listArtifactKeys / listVersions stay consistent with missing keys", async () => {
		const service = new InMemoryArtifactService();

		const [keysBefore, versionsBefore, ...rest] = await Promise.all([
			service.listArtifactKeys(base),
			service.listVersions({ ...base, filename: "ghost.txt" }),
			service.loadArtifact({ ...base, filename: "ghost.txt", version: 0 }),
			service.loadArtifact({ ...base, filename: "ghost.txt", version: -1 }),
			service.deleteArtifact({ ...base, filename: "ghost.txt" }),
		]);

		expect(keysBefore).toEqual([]);
		expect(versionsBefore).toEqual([]);
		expect(rest[0]).toBeNull();
		expect(rest[1]).toBeNull();
		expect(rest[2]).toBeUndefined();
	});

	it("concurrent saves across sessions isolate keys and list results", async () => {
		const service = new InMemoryArtifactService();
		await Promise.all([
			service.saveArtifact({
				...base,
				sessionId: "sess-a",
				filename: "note.txt",
				artifact: { text: "a" },
			}),
			service.saveArtifact({
				...base,
				sessionId: "sess-b",
				filename: "note.txt",
				artifact: { text: "b" },
			}),
			service.saveArtifact({
				...base,
				sessionId: "sess-a",
				filename: "user:shared.txt",
				artifact: { text: "shared" },
			}),
		]);

		const [keysA, keysB, sharedFromB] = await Promise.all([
			service.listArtifactKeys({ ...base, sessionId: "sess-a" }),
			service.listArtifactKeys({ ...base, sessionId: "sess-b" }),
			service.loadArtifact({
				...base,
				sessionId: "sess-b",
				filename: "user:shared.txt",
			}),
		]);

		expect(keysA).toEqual(["note.txt", "user:shared.txt"]);
		expect(keysB).toEqual(["note.txt", "user:shared.txt"]);
		expect(sharedFromB).toEqual({ text: "shared" });
	});

	it("concurrent delete while loading missing/present keys is race-safe", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "doomed.txt",
			artifact: { text: "bye" },
		});

		const [deleted, loadedDuring, loadedMissing] = await Promise.all([
			service.deleteArtifact({ ...base, filename: "doomed.txt" }),
			service.loadArtifact({ ...base, filename: "doomed.txt" }),
			service.loadArtifact({ ...base, filename: "never-existed.txt" }),
		]);

		expect(deleted).toBeUndefined();
		expect(loadedMissing).toBeNull();
		expect(loadedDuring === null || loadedDuring?.text === "bye").toBe(true);
		expect(
			await service.loadArtifact({ ...base, filename: "doomed.txt" }),
		).toBeNull();
	});

	it("stores and loads large metadata stubs under concurrent put/get", async () => {
		const service = new InMemoryArtifactService();
		const largeText = "x".repeat(50_000);
		const largeInline = "A".repeat(32_000);
		const fatStub = {
			text: largeText,
			inlineData: {
				data: largeInline,
				mimeType: "application/octet-stream",
			},
			fileData: {
				fileUri: `https://example.com/${"p".repeat(2048)}`,
				mimeType: "text/plain",
			},
		};

		const versions = await Promise.all(
			Array.from({ length: 8 }, (_, i) =>
				service.saveArtifact({
					...base,
					filename: `fat-${i}.bin`,
					artifact: {
						...fatStub,
						text: `${largeText}-${i}`,
					},
				}),
			),
		);
		expect(versions).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);

		const loaded = await Promise.all(
			Array.from({ length: 8 }, (_, i) =>
				service.loadArtifact({ ...base, filename: `fat-${i}.bin` }),
			),
		);

		for (let i = 0; i < 8; i++) {
			expect(loaded[i]?.text).toBe(`${largeText}-${i}`);
			expect(loaded[i]?.inlineData?.data?.length).toBe(32_000);
			expect(loaded[i]?.fileData?.fileUri?.length).toBeGreaterThan(2000);
		}

		const keys = await service.listArtifactKeys(base);
		expect(keys).toHaveLength(8);
	});

	it("concurrent ref resolution against a large stub target stays stable", async () => {
		const service = new InMemoryArtifactService();
		const blob = { text: `blob-${"Z".repeat(10_000)}` };
		await service.saveArtifact({
			...base,
			filename: "target.bin",
			artifact: blob,
		});
		const uri = getArtifactUri({
			...base,
			filename: "target.bin",
			version: 0,
		});

		await Promise.all(
			Array.from({ length: 12 }, (_, i) =>
				service.saveArtifact({
					...base,
					filename: `alias-${i}.txt`,
					artifact: {
						fileData: { fileUri: uri, mimeType: "text/plain" },
					},
				}),
			),
		);

		const resolved = await Promise.all(
			Array.from({ length: 12 }, (_, i) =>
				service.loadArtifact({ ...base, filename: `alias-${i}.txt` }),
			),
		);
		expect(resolved.every((p) => p?.text === blob.text)).toBe(true);
	});

	it("concurrent listArtifactKeys while saving does not throw and ends consistent", async () => {
		const service = new InMemoryArtifactService();
		const saves = Array.from({ length: 10 }, (_, i) =>
			service.saveArtifact({
				...base,
				filename: `k-${i}.txt`,
				artifact: { text: String(i) },
			}),
		);
		const lists = Array.from({ length: 10 }, () =>
			service.listArtifactKeys(base),
		);

		const outcomes = await Promise.all([...saves, ...lists]);
		const finalKeys = outcomes[outcomes.length - 1] as string[];
		expect(await service.listArtifactKeys(base)).toEqual(
			Array.from({ length: 10 }, (_, i) => `k-${i}.txt`).sort(),
		);
		expect(Array.isArray(finalKeys)).toBe(true);
	});
});
