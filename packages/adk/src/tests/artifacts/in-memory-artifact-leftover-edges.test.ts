import { describe, expect, it, vi } from "vitest";
import {
	getArtifactUri,
	parseArtifactUri,
} from "../../artifacts/artifact-util";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

describe('InMemoryArtifactService leftover: fileUri || ""', () => {
	const base = {
		appName: "app",
		userId: "user-1",
		sessionId: "session-1",
	};

	function makeFlickerRef(validUri: string, later: unknown) {
		let reads = 0;
		const fileData: { mimeType: string } = { mimeType: "text/plain" };
		Object.defineProperty(fileData, "fileUri", {
			enumerable: true,
			configurable: true,
			get() {
				reads++;
				if (reads <= 2) {
					return validUri;
				}
				return later as any;
			},
		});
		return { fileData, getReads: () => reads };
	}

	it("passes empty string into parseArtifactUri when fileUri vanishes after isArtifactRef", async () => {
		const service = new InMemoryArtifactService();
		const path = "app/user-1/session-1/flicker-ref.txt";
		const validUri = getArtifactUri({
			...base,
			filename: "target.txt",
			version: 0,
		});
		const { fileData, getReads } = makeFlickerRef(validUri, "");
		(service as any).artifacts.set(path, [{ fileData }]);

		await expect(
			service.loadArtifact({ ...base, filename: "flicker-ref.txt" }),
		).rejects.toThrow(/Invalid artifact reference URI/);
		expect(getReads()).toBeGreaterThanOrEqual(3);
	});

	it('fileUri || "" path: undefined after isArtifactRef throws invalid URI', async () => {
		const service = new InMemoryArtifactService();
		const path = "app/user-1/session-1/flicker-undef.txt";
		const { fileData } = makeFlickerRef(
			"artifact://apps/app/users/user-1/artifacts/user:x.txt/versions/0",
			undefined,
		);
		(service as any).artifacts.set(path, [{ fileData }]);

		await expect(
			service.loadArtifact({ ...base, filename: "flicker-undef.txt" }),
		).rejects.toThrow(/Invalid artifact reference URI/);
	});

	it('null fileUri after isArtifactRef uses || "" and throws', async () => {
		const service = new InMemoryArtifactService();
		const path = "app/user-1/session-1/flicker-null.txt";
		const { fileData } = makeFlickerRef(
			"artifact://apps/app/users/user-1/sessions/session-1/artifacts/t.txt/versions/0",
			null,
		);
		(service as any).artifacts.set(path, [{ fileData }]);

		await expect(
			service.loadArtifact({ ...base, filename: "flicker-null.txt" }),
		).rejects.toThrow(/Invalid artifact reference URI/);
	});

	const invalidAfterRef = ["", undefined, null, "not-artifact", "artifact://"];

	for (const laterUri of invalidAfterRef) {
		it(`fileUri flicker to ${JSON.stringify(laterUri)} hits || "" / invalid parse`, async () => {
			const service = new InMemoryArtifactService();
			const path = `app/user-1/session-1/flicker-${String(laterUri)}.txt`;
			const { fileData } = makeFlickerRef(
				getArtifactUri({
					...base,
					filename: "src.txt",
					version: 0,
				}),
				laterUri,
			);
			(service as any).artifacts.set(path, [{ fileData }]);
			await expect(
				service.loadArtifact({
					...base,
					filename: `flicker-${String(laterUri)}.txt`,
				}),
			).rejects.toThrow(/Invalid artifact reference URI/);
		});
	}
});

describe("InMemoryArtifactService leftover: parsedUri.sessionId || sessionId", () => {
	const base = {
		appName: "app",
		userId: "user-1",
		sessionId: "session-fallback",
	};

	it("user-scoped URI (sessionId undefined) falls back to caller sessionId for load path", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "user:profile.txt",
			artifact: { text: "profile-body" },
		});
		const uri = getArtifactUri({
			appName: base.appName,
			userId: base.userId,
			filename: "user:profile.txt",
			version: 0,
		});
		expect(parseArtifactUri(uri)?.sessionId).toBeUndefined();

		await service.saveArtifact({
			...base,
			filename: "alias.txt",
			artifact: {
				fileData: { fileUri: uri, mimeType: "text/plain" },
			},
		});

		expect(
			await service.loadArtifact({ ...base, filename: "alias.txt" }),
		).toEqual({ text: "profile-body" });
	});

	const fallbackSessions = [
		"session-a",
		"session-b",
		"sess-1",
		"other",
		"fallback-id",
	];

	for (const sessionId of fallbackSessions) {
		it(`user-scoped ref resolves with caller sessionId=${sessionId} (unused for user: path)`, async () => {
			const service = new InMemoryArtifactService();
			await service.saveArtifact({
				appName: "app",
				userId: "user-1",
				sessionId,
				filename: "user:shared.txt",
				artifact: { text: `data-${sessionId}` },
			});
			const uri = getArtifactUri({
				appName: "app",
				userId: "user-1",
				filename: "user:shared.txt",
				version: 0,
			});
			await service.saveArtifact({
				appName: "app",
				userId: "user-1",
				sessionId,
				filename: "ptr.txt",
				artifact: {
					fileData: { fileUri: uri, mimeType: "text/plain" },
				},
			});
			expect(
				await service.loadArtifact({
					appName: "app",
					userId: "user-1",
					sessionId,
					filename: "ptr.txt",
				}),
			).toEqual({ text: `data-${sessionId}` });
		});
	}

	it("session-scoped URI keeps parsed sessionId and does not use caller fallback", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			appName: "app",
			userId: "user-1",
			sessionId: "real-sess",
			filename: "note.txt",
			artifact: { text: "from-real" },
		});
		const uri = getArtifactUri({
			appName: "app",
			userId: "user-1",
			sessionId: "real-sess",
			filename: "note.txt",
			version: 0,
		});
		expect(parseArtifactUri(uri)?.sessionId).toBe("real-sess");

		await service.saveArtifact({
			appName: "app",
			userId: "user-1",
			sessionId: "caller-sess",
			filename: "link.txt",
			artifact: {
				fileData: { fileUri: uri, mimeType: "text/plain" },
			},
		});

		expect(
			await service.loadArtifact({
				appName: "app",
				userId: "user-1",
				sessionId: "caller-sess",
				filename: "link.txt",
			}),
		).toEqual({ text: "from-real" });
	});

	it("empty-string sessionId in parsed URI is falsy and falls back to caller", async () => {
		const service = new InMemoryArtifactService();
		const parseSpy = vi.spyOn(
			await import("../../artifacts/artifact-util"),
			"parseArtifactUri",
		);
		parseSpy.mockReturnValue({
			appName: "app",
			userId: "user-1",
			sessionId: "",
			filename: "user:empty-sess.txt",
			version: 0,
		});

		await service.saveArtifact({
			...base,
			filename: "user:empty-sess.txt",
			artifact: { text: "via-fallback" },
		});
		await service.saveArtifact({
			...base,
			filename: "ref-empty-sess.txt",
			artifact: {
				fileData: {
					fileUri:
						"artifact://apps/app/users/user-1/artifacts/user:empty-sess.txt/versions/0",
					mimeType: "text/plain",
				},
			},
		});

		expect(
			await service.loadArtifact({ ...base, filename: "ref-empty-sess.txt" }),
		).toEqual({ text: "via-fallback" });
		parseSpy.mockRestore();
	});

	it("undefined sessionId from parse uses caller sessionId argument", async () => {
		const service = new InMemoryArtifactService();
		const util = await import("../../artifacts/artifact-util");
		const parseSpy = vi.spyOn(util, "parseArtifactUri").mockReturnValue({
			appName: "app",
			userId: "user-1",
			sessionId: undefined,
			filename: "user:undef.txt",
			version: 0,
		});

		await service.saveArtifact({
			...base,
			filename: "user:undef.txt",
			artifact: { text: "undef-body" },
		});
		await service.saveArtifact({
			...base,
			filename: "ref-undef.txt",
			artifact: {
				fileData: {
					fileUri:
						"artifact://apps/app/users/user-1/artifacts/user:undef.txt/versions/0",
					mimeType: "text/plain",
				},
			},
		});

		expect(
			await service.loadArtifact({ ...base, filename: "ref-undef.txt" }),
		).toEqual({ text: "undef-body" });
		parseSpy.mockRestore();
	});
});

describe("InMemoryArtifactService leftover: ref matrix across scopes", () => {
	const cases = [
		{
			label: "user-scoped v0",
			filename: "user:a.txt",
			text: "a0",
			version: 0,
			sessionId: undefined as string | undefined,
		},
		{
			label: "user-scoped v1",
			filename: "user:b.txt",
			text: "b1",
			version: 1,
			sessionId: undefined as string | undefined,
		},
		{
			label: "session-scoped",
			filename: "c.txt",
			text: "c0",
			version: 0,
			sessionId: "sess-x" as string | undefined,
		},
	];

	for (const c of cases) {
		it(`resolves ${c.label} ref via fileUri and sessionId coalesce`, async () => {
			const service = new InMemoryArtifactService();
			const saveArgs = {
				appName: "app",
				userId: "u",
				sessionId: c.sessionId ?? "caller",
				filename: c.filename,
				artifact: { text: c.text },
			};
			await service.saveArtifact(saveArgs);
			if (c.version > 0) {
				await service.saveArtifact({
					...saveArgs,
					artifact: { text: c.text },
				});
			}
			const uri = getArtifactUri({
				appName: "app",
				userId: "u",
				filename: c.filename,
				version: c.version,
				sessionId: c.sessionId,
			});
			await service.saveArtifact({
				appName: "app",
				userId: "u",
				sessionId: "caller",
				filename: `ref-${c.label}.txt`,
				artifact: {
					fileData: { fileUri: uri, mimeType: "text/plain" },
				},
			});
			expect(
				await service.loadArtifact({
					appName: "app",
					userId: "u",
					sessionId: "caller",
					filename: `ref-${c.label}.txt`,
				}),
			).toEqual({ text: c.text });
		});
	}
});
