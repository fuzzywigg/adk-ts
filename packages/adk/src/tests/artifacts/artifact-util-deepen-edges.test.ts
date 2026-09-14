import { describe, expect, it } from "vitest";
import {
	getArtifactUri,
	isArtifactRef,
	parseArtifactUri,
} from "../../artifacts/artifact-util";

describe("artifact-util deepen edges (TOKENMAXX remainder)", () => {
	it('sessionId "0" is truthy and produces session-scoped URI', () => {
		const uri = getArtifactUri({
			appName: "app",
			userId: "u",
			filename: "f.bin",
			version: 1,
			sessionId: "0",
		});
		expect(uri).toBe(
			"artifact://apps/app/users/u/sessions/0/artifacts/f.bin/versions/1",
		);
		expect(parseArtifactUri(uri)).toEqual({
			appName: "app",
			userId: "u",
			sessionId: "0",
			filename: "f.bin",
			version: 1,
		});
	});

	it('sessionId "" is falsy and produces user-scoped URI', () => {
		const uri = getArtifactUri({
			appName: "app",
			userId: "u",
			filename: "f.bin",
			version: 1,
			sessionId: "",
		});
		expect(uri).toBe("artifact://apps/app/users/u/artifacts/f.bin/versions/1");
		expect(parseArtifactUri(uri)?.sessionId).toBeUndefined();
	});

	it("isArtifactRef true for unparsable artifact:// prefix-only URIs", () => {
		expect(
			isArtifactRef({
				fileData: { fileUri: "artifact://", mimeType: "text/plain" },
			}),
		).toBe(true);
		expect(
			isArtifactRef({
				fileData: {
					fileUri: "artifact://not/a/valid/path",
					mimeType: "text/plain",
				},
			}),
		).toBe(true);
		expect(parseArtifactUri("artifact://not/a/valid/path")).toBeNull();
	});

	it("round-trips Number.MAX_SAFE_INTEGER version", () => {
		const version = Number.MAX_SAFE_INTEGER;
		const uri = getArtifactUri({
			appName: "a",
			userId: "u",
			sessionId: "s",
			filename: "big",
			version,
		});
		expect(parseArtifactUri(uri)?.version).toBe(version);
	});

	it("rejects scientific notation versions via digit-only regex", () => {
		expect(
			parseArtifactUri(
				"artifact://apps/a/users/u/sessions/s/artifacts/f/versions/1e2",
			),
		).toBeNull();
		expect(
			parseArtifactUri("artifact://apps/a/users/u/artifacts/f/versions/1e2"),
		).toBeNull();
	});

	it("allows . and _ in filename segments but rejects embedded slash", () => {
		const dotted = getArtifactUri({
			appName: "a",
			userId: "u",
			filename: "report.v2_final.txt",
			version: 3,
		});
		expect(parseArtifactUri(dotted)?.filename).toBe("report.v2_final.txt");
		expect(
			parseArtifactUri(
				"artifact://apps/a/users/u/artifacts/dir/file/versions/1",
			),
		).toBeNull();
	});

	it("treats encoded %2F as literal filename characters not a slash", () => {
		const uri = getArtifactUri({
			appName: "a",
			userId: "u",
			filename: "dir%2Ffile",
			version: 1,
			sessionId: "s",
		});
		expect(parseArtifactUri(uri)).toEqual({
			appName: "a",
			userId: "u",
			sessionId: "s",
			filename: "dir%2Ffile",
			version: 1,
		});
	});

	it("isArtifactRef false when fileUri missing or empty", () => {
		expect(isArtifactRef({} as any)).toBe(false);
		expect(isArtifactRef({ fileData: {} } as any)).toBe(false);
		expect(
			isArtifactRef({ fileData: { fileUri: "", mimeType: "text/plain" } }),
		).toBe(false);
	});
});
