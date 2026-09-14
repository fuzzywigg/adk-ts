import { describe, expect, it } from "vitest";
import * as artifacts from "../../artifacts";

describe("artifacts barrel exports", () => {
	it("exposes URI helpers", () => {
		expect(typeof artifacts.parseArtifactUri).toBe("function");
		expect(typeof artifacts.getArtifactUri).toBe("function");
		expect(typeof artifacts.isArtifactRef).toBe("function");

		const uri = artifacts.getArtifactUri({
			appName: "app",
			userId: "user",
			sessionId: "sess",
			filename: "f.txt",
			version: 1,
		});
		expect(artifacts.parseArtifactUri(uri)).toMatchObject({
			appName: "app",
			userId: "user",
			sessionId: "sess",
			filename: "f.txt",
			version: 1,
		});
		expect(
			artifacts.isArtifactRef({
				fileData: { fileUri: uri, mimeType: "text/plain" },
			}),
		).toBe(true);
	});

	it("exposes in-memory and GCS artifact services", () => {
		expect(typeof artifacts.InMemoryArtifactService).toBe("function");
		expect(typeof artifacts.GcsArtifactService).toBe("function");

		const memory = new artifacts.InMemoryArtifactService();
		expect(memory).toBeInstanceOf(artifacts.InMemoryArtifactService);
	});
});
