import { describe, expect, it } from "vitest";
import { getArtifactUri } from "../../artifacts/artifact-util";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

/**
 * Sixteenth leftover: flicker `fileUri` after isArtifactRef — leftover-edges
 * covers vanish to ""/null/undefined/"not-artifact". String `"0"` / `"false"`
 * skip `|| ""` (truthy) but still fail parseArtifactUri → throw with the
 * literal value in the message.
 */
describe("InMemoryArtifactService ref fileUri string-zero-false no-coalesce sixteenth leftover", () => {
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

	it.each([
		{ label: '"0"', later: "0" },
		{ label: '"false"', later: "false" },
	])('fileUri flicker to $label skips || "" and throws invalid URI', async ({
		later,
	}) => {
		const service = new InMemoryArtifactService();
		const path = `app/user-1/session-1/flicker-${later}.txt`;
		const { fileData } = makeFlickerRef(
			getArtifactUri({ ...base, filename: "src.txt", version: 0 }),
			later,
		);
		(service as any).artifacts.set(path, [{ fileData }]);

		await expect(
			service.loadArtifact({
				...base,
				filename: `flicker-${later}.txt`,
			}),
		).rejects.toThrow(new RegExp(`Invalid artifact reference URI: ${later}`));
	});

	it('flicker to empty still coalesces via || "" (leftover control)', async () => {
		const service = new InMemoryArtifactService();
		const path = "app/user-1/session-1/flicker-empty.txt";
		const { fileData } = makeFlickerRef(
			getArtifactUri({ ...base, filename: "src.txt", version: 0 }),
			"",
		);
		(service as any).artifacts.set(path, [{ fileData }]);
		await expect(
			service.loadArtifact({ ...base, filename: "flicker-empty.txt" }),
		).rejects.toThrow(/Invalid artifact reference URI/);
	});
});
