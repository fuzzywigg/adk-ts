import { describe, expect, it } from "vitest";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

/**
 * Fifteenth leftover: empty-payload gate `!artifactEntry.text` — sixth keeps
 * string `"0"`/`"false"`. Primitive `text: 0` / `text: false` are falsy →
 * null when no inline/fileData (asymmetry vs string keep).
 */
describe("InMemoryArtifactService text falsy-primitive null fifteenth leftover", () => {
	const base = {
		appName: "app",
		userId: "uid",
		sessionId: "sess",
	};

	it.each([
		{ label: "0", text: 0 },
		{ label: "false", text: false },
	])("text $label without inline/fileData → null", async ({ text }) => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: `t-${String(text)}.txt`,
			artifact: { text } as any,
		});
		await expect(
			service.loadArtifact({
				...base,
				filename: `t-${String(text)}.txt`,
			}),
		).resolves.toBeNull();
	});

	it.each([
		{ label: '"0"', text: "0" },
		{ label: '"false"', text: "false" },
	])("string text $label still kept (sixth control)", async ({ text }) => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: `s-${text}.txt`,
			artifact: { text },
		});
		await expect(
			service.loadArtifact({
				...base,
				filename: `s-${text}.txt`,
			}),
		).resolves.toEqual({ text });
	});
});
