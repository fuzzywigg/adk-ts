import { describe, expect, it } from "vitest";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";
import { getArtifactUri } from "../../artifacts/artifact-util";

/**
 * Leftover: artifact ref with sessionId "" from parse (user-scoped) uses
 * `parsedUri.sessionId || sessionId` — empty string is falsy so caller
 * sessionId is used for the recursive load path (session-scoped target).
 */
describe("InMemoryArtifactService sixth leftover: empty sessionId coalesce on ref", () => {
	it("user-scoped ref resolves via caller session for non-user filename target", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			appName: "app",
			userId: "uid",
			sessionId: "caller-sess",
			filename: "target.txt",
			artifact: { text: "payload" },
		});

		const userScopedUri = getArtifactUri({
			appName: "app",
			userId: "uid",
			filename: "target.txt",
			version: 0,
		});

		await service.saveArtifact({
			appName: "app",
			userId: "uid",
			sessionId: "caller-sess",
			filename: "alias.txt",
			artifact: {
				fileData: { fileUri: userScopedUri, mimeType: "text/plain" },
			},
		});

		// user-scoped getArtifactUri omits session → parse sessionId undefined
		// → || caller-sess loads session path target.txt
		await expect(
			service.loadArtifact({
				appName: "app",
				userId: "uid",
				sessionId: "caller-sess",
				filename: "alias.txt",
			}),
		).resolves.toEqual({ text: "payload" });
	});

	it("user-scoped ref to user: file ignores caller session path", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			appName: "app",
			userId: "uid",
			sessionId: "ignored",
			filename: "user:profile.txt",
			artifact: { text: "profile" },
		});
		const uri = getArtifactUri({
			appName: "app",
			userId: "uid",
			filename: "user:profile.txt",
			version: 0,
		});
		await service.saveArtifact({
			appName: "app",
			userId: "uid",
			sessionId: "other-sess",
			filename: "pointer.txt",
			artifact: {
				fileData: { fileUri: uri, mimeType: "text/plain" },
			},
		});
		await expect(
			service.loadArtifact({
				appName: "app",
				userId: "uid",
				sessionId: "other-sess",
				filename: "pointer.txt",
			}),
		).resolves.toEqual({ text: "profile" });
	});

	it("session-scoped ref uses embedded sessionId over caller", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			appName: "app",
			userId: "uid",
			sessionId: "embedded",
			filename: "data.txt",
			artifact: { text: "embedded-data" },
		});
		const uri = getArtifactUri({
			appName: "app",
			userId: "uid",
			sessionId: "embedded",
			filename: "data.txt",
			version: 0,
		});
		await service.saveArtifact({
			appName: "app",
			userId: "uid",
			sessionId: "caller",
			filename: "link.txt",
			artifact: {
				fileData: { fileUri: uri, mimeType: "text/plain" },
			},
		});
		await expect(
			service.loadArtifact({
				appName: "app",
				userId: "uid",
				sessionId: "caller",
				filename: "link.txt",
			}),
		).resolves.toEqual({ text: "embedded-data" });
	});

	it("ref version pins historical version not latest", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			appName: "app",
			userId: "uid",
			sessionId: "s",
			filename: "hist.txt",
			artifact: { text: "v0" },
		});
		await service.saveArtifact({
			appName: "app",
			userId: "uid",
			sessionId: "s",
			filename: "hist.txt",
			artifact: { text: "v1" },
		});
		const uri = getArtifactUri({
			appName: "app",
			userId: "uid",
			sessionId: "s",
			filename: "hist.txt",
			version: 0,
		});
		await service.saveArtifact({
			appName: "app",
			userId: "uid",
			sessionId: "s",
			filename: "pin.txt",
			artifact: {
				fileData: { fileUri: uri, mimeType: "text/plain" },
			},
		});
		await expect(
			service.loadArtifact({
				appName: "app",
				userId: "uid",
				sessionId: "s",
				filename: "pin.txt",
			}),
		).resolves.toEqual({ text: "v0" });
	});
});
