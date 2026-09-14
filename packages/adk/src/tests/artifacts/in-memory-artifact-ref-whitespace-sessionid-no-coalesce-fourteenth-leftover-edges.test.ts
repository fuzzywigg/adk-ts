import { describe, expect, it } from "vitest";
import { getArtifactUri } from "../../artifacts/artifact-util";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

/**
 * Fourteenth leftover: `parsedUri.sessionId || sessionId` on ref load —
 * sixth covers falsy undefined/"" coalesce to caller. Truthy whitespace
 * sessionId in the URI blocks coalesce (distinct from getArtifactUri
 * thirteenth whitespace session scope).
 */
describe("InMemoryArtifactService ref whitespace sessionId no-coalesce fourteenth leftover", () => {
	it('sessionId " " in ref URI does not fall back to caller session', async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			appName: "app",
			userId: "uid",
			sessionId: "real-sess",
			filename: "payload.txt",
			artifact: { text: "here" },
		});

		const uri = getArtifactUri({
			appName: "app",
			userId: "uid",
			sessionId: " ",
			filename: "payload.txt",
			version: 0,
		});

		await service.saveArtifact({
			appName: "app",
			userId: "uid",
			sessionId: "real-sess",
			filename: "alias.txt",
			artifact: {
				fileData: { fileUri: uri, mimeType: "text/plain" },
			},
		});

		await expect(
			service.loadArtifact({
				appName: "app",
				userId: "uid",
				sessionId: "real-sess",
				filename: "alias.txt",
			}),
		).resolves.toBeNull();
	});

	it("empty sessionId in user-scoped URI still coalesces (sixth control)", async () => {
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
		await expect(
			service.loadArtifact({
				appName: "app",
				userId: "uid",
				sessionId: "caller-sess",
				filename: "alias.txt",
			}),
		).resolves.toEqual({ text: "payload" });
	});
});
