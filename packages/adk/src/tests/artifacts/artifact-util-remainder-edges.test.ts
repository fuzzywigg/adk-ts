import { describe, expect, it } from "vitest";
import {
	getArtifactUri,
	isArtifactRef,
	parseArtifactUri,
} from "../../artifacts/artifact-util";

describe("artifact-util remainder edges (TOKENMAXX after #153)", () => {
	it('sessionId " " (whitespace) is truthy session scope', () => {
		const uri = getArtifactUri({
			appName: "app",
			userId: "u",
			filename: "f",
			version: 1,
			sessionId: " ",
		});
		expect(uri).toContain("/sessions/ /artifacts/");
		expect(parseArtifactUri(uri)?.sessionId).toBe(" ");
	});

	it("sessionId undefined vs omitted produce identical user-scoped URIs", () => {
		const a = getArtifactUri({
			appName: "app",
			userId: "u",
			filename: "f",
			version: 2,
			sessionId: undefined,
		});
		const b = getArtifactUri({
			appName: "app",
			userId: "u",
			filename: "f",
			version: 2,
		});
		expect(a).toBe(b);
	});

	it("sessionId null is falsy and user-scoped", () => {
		const uri = getArtifactUri({
			appName: "app",
			userId: "u",
			filename: "f",
			version: 1,
			sessionId: null as any,
		});
		expect(uri).toBe("artifact://apps/app/users/u/artifacts/f/versions/1");
	});

	it("float version stringifies then fails parse via \\d+ requirement", () => {
		const uri = getArtifactUri({
			appName: "a",
			userId: "u",
			filename: "f",
			version: 1.5 as any,
		});
		expect(uri).toContain("/versions/1.5");
		expect(parseArtifactUri(uri)).toBeNull();
	});

	it("negative version stringifies then fails parse", () => {
		const uri = getArtifactUri({
			appName: "a",
			userId: "u",
			filename: "f",
			version: -1 as any,
		});
		expect(uri).toContain("/versions/-1");
		expect(parseArtifactUri(uri)).toBeNull();
	});

	it("empty appName/userId segments make URI unparsable", () => {
		const uri = getArtifactUri({
			appName: "",
			userId: "",
			filename: "f",
			version: 1,
		});
		expect(uri).toBe("artifact://apps//users//artifacts/f/versions/1");
		expect(parseArtifactUri(uri)).toBeNull();
	});

	it("slash in filename makes generated URI unparsable", () => {
		const uri = getArtifactUri({
			appName: "a",
			userId: "u",
			filename: "a/b.txt",
			version: 1,
		});
		expect(parseArtifactUri(uri)).toBeNull();
	});

	it("isArtifactRef rejects leading whitespace and uppercase scheme", () => {
		expect(
			isArtifactRef({
				fileData: {
					fileUri: " artifact://apps/a/users/u/artifacts/f/versions/1",
					mimeType: "text/plain",
				},
			}),
		).toBe(false);
		expect(
			isArtifactRef({
				fileData: {
					fileUri: "ARTIFACT://apps/a/users/u/artifacts/f/versions/1",
					mimeType: "text/plain",
				},
			}),
		).toBe(false);
	});

	it("isArtifactRef true for prefix even with query string that parse rejects", () => {
		const fileUri = "artifact://apps/a/users/u/artifacts/f/versions/1?x=1";
		expect(
			isArtifactRef({ fileData: { fileUri, mimeType: "text/plain" } }),
		).toBe(true);
		expect(parseArtifactUri(fileUri)).toBeNull();
	});
});
