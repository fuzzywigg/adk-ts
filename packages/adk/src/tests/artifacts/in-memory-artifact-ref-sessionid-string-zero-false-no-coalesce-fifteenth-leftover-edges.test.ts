import { describe, expect, it } from "vitest";
import { getArtifactUri } from "../../artifacts/artifact-util";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

/**
 * Fifteenth leftover: `parsedUri.sessionId || sessionId` — fourteenth pins
 * whitespace `" "` no-coalesce. String `"0"` / `"false"` are also truthy and
 * block fallback to the caller session (distinct path / miss).
 */
describe("InMemoryArtifactService ref sessionId string-zero-false no-coalesce fifteenth leftover", () => {
	it.each([
		{ label: '"0"', sessionId: "0" },
		{ label: '"false"', sessionId: "false" },
	])("sessionId $label in ref URI does not fall back to caller session", async ({
		sessionId,
	}) => {
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
			sessionId,
			filename: "payload.txt",
			version: 0,
		});

		await service.saveArtifact({
			appName: "app",
			userId: "uid",
			sessionId: "real-sess",
			filename: `alias-${sessionId}.txt`,
			artifact: {
				fileData: { fileUri: uri, mimeType: "text/plain" },
			},
		});

		await expect(
			service.loadArtifact({
				appName: "app",
				userId: "uid",
				sessionId: "real-sess",
				filename: `alias-${sessionId}.txt`,
			}),
		).resolves.toBeNull();
	});

	it('sessionId "0" hits when payload saved under that session', async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			appName: "app",
			userId: "uid",
			sessionId: "0",
			filename: "payload.txt",
			artifact: { text: "under-zero" },
		});
		const uri = getArtifactUri({
			appName: "app",
			userId: "uid",
			sessionId: "0",
			filename: "payload.txt",
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
		).resolves.toEqual({ text: "under-zero" });
	});
});
