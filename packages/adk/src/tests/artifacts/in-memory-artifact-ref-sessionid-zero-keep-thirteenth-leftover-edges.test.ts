import { describe, expect, it } from "vitest";
import { getArtifactUri } from "../../artifacts/artifact-util";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

/**
 * Thirteenth leftover: ref load uses `parsedUri.sessionId || sessionId`.
 * Sixth covers undefined/"" fallback. `"0"` is truthy → must keep embedded
 * session and not fall back to the caller sessionId.
 */
describe("InMemoryArtifactService ref sessionId 0 keep thirteenth leftover", () => {
	it('embedded sessionId "0" is kept (does not fall back to caller)', async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			appName: "app",
			userId: "uid",
			sessionId: "0",
			filename: "zero.txt",
			artifact: { text: "in-zero" },
		});
		await service.saveArtifact({
			appName: "app",
			userId: "uid",
			sessionId: "caller",
			filename: "caller.txt",
			artifact: { text: "in-caller" },
		});

		const uri = getArtifactUri({
			appName: "app",
			userId: "uid",
			sessionId: "0",
			filename: "zero.txt",
			version: 0,
		});
		await service.saveArtifact({
			appName: "app",
			userId: "uid",
			sessionId: "caller",
			filename: "alias.txt",
			artifact: {
				fileData: { fileUri: uri, mimeType: "text/plain" },
			},
		});

		await expect(
			service.loadArtifact({
				appName: "app",
				userId: "uid",
				sessionId: "caller",
				filename: "alias.txt",
			}),
		).resolves.toEqual({ text: "in-zero" });
	});
});
