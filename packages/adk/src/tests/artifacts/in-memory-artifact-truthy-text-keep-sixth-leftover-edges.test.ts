import { describe, expect, it } from "vitest";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

/**
 * Leftover beyond empty-binary #166: loadArtifact empty-payload gate uses
 * truthiness of text / inlineData.data / fileData. Truthy non-content strings
 * ("0","false"," ") keep; falsy empty drops to null; fileData presence alone keeps.
 */
describe("InMemoryArtifactService sixth leftover: truthy text / fileData keep", () => {
	const base = {
		appName: "app",
		userId: "uid",
		sessionId: "sess",
	};

	const truthyTexts = ["0", "false", " ", "\n", "\t", "null", "undefined"];

	for (const text of truthyTexts) {
		it(`keeps truthy text ${JSON.stringify(text)}`, async () => {
			const service = new InMemoryArtifactService();
			await service.saveArtifact({
				...base,
				filename: `t-${encodeURIComponent(text)}.txt`,
				artifact: { text },
			});
			await expect(
				service.loadArtifact({
					...base,
					filename: `t-${encodeURIComponent(text)}.txt`,
				}),
			).resolves.toEqual({ text });
		});
	}

	it("empty text without inline/fileData returns null", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "empty.txt",
			artifact: { text: "" },
		});
		await expect(
			service.loadArtifact({ ...base, filename: "empty.txt" }),
		).resolves.toBeNull();
	});

	it("fileData-only without text/inlineData is kept", async () => {
		const service = new InMemoryArtifactService();
		const artifact = {
			fileData: { fileUri: "gs://bucket/obj", mimeType: "text/plain" },
		};
		await service.saveArtifact({
			...base,
			filename: "ref-only.txt",
			artifact,
		});
		await expect(
			service.loadArtifact({ ...base, filename: "ref-only.txt" }),
		).resolves.toEqual(artifact);
	});

	it("inlineData data '0' string is truthy length and kept", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "zero.txt",
			artifact: {
				inlineData: { data: "0", mimeType: "text/plain" },
			},
		});
		const loaded = await service.loadArtifact({
			...base,
			filename: "zero.txt",
		});
		expect(loaded?.inlineData?.data).toBe("0");
	});

	it("empty object part with no fields returns null", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "blank.json",
			artifact: {},
		});
		await expect(
			service.loadArtifact({ ...base, filename: "blank.json" }),
		).resolves.toBeNull();
	});

	it("text '0' wins over empty inlineData", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "mixed.txt",
			artifact: {
				text: "0",
				inlineData: { data: "", mimeType: "text/plain" },
			},
		});
		await expect(
			service.loadArtifact({ ...base, filename: "mixed.txt" }),
		).resolves.toMatchObject({ text: "0" });
	});
});
