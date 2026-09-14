import { describe, expect, it } from "vitest";
import {
	getArtifactUri,
	parseArtifactUri,
} from "../../artifacts/artifact-util";

/**
 * Thirteenth leftover: path keywords in the regex are case-sensitive;
 * getArtifactUri stringifies non-numeric versions. Eleventh/twelfth cover
 * scheme case and isArtifactRef non-string startsWith.
 */
describe("artifact-util path keyword case / version stringify thirteenth leftover", () => {
	it.each([
		{
			label: "Apps",
			uri: "artifact://Apps/a/users/u/artifacts/f/versions/1",
		},
		{
			label: "Users",
			uri: "artifact://apps/a/Users/u/artifacts/f/versions/1",
		},
		{
			label: "Sessions",
			uri: "artifact://apps/a/users/u/sessions/s/Artifacts/f/versions/1",
		},
	])("$label path segment fails regex → null", ({ uri }) => {
		expect(parseArtifactUri(uri)).toBeNull();
	});

	it("truthy non-string uri throws TypeError via startsWith", () => {
		expect(() => parseArtifactUri(true as any)).toThrow(TypeError);
		expect(() => parseArtifactUri(1 as any)).toThrow(TypeError);
	});

	it.each([
		{ label: "false", version: false as any, fragment: "/versions/false" },
		{ label: "empty", version: "" as any, fragment: "/versions/" },
		{ label: "true", version: true as any, fragment: "/versions/true" },
	])("getArtifactUri version $label stringifies into URI", ({
		version,
		fragment,
	}) => {
		const uri = getArtifactUri({
			appName: "a",
			userId: "u",
			filename: "f",
			version,
		});
		expect(uri).toContain(fragment);
		expect(parseArtifactUri(uri)).toBeNull();
	});

	it("lowercase path keywords still parse (control)", () => {
		expect(
			parseArtifactUri("artifact://apps/a/users/u/artifacts/f/versions/1"),
		).toEqual({
			appName: "a",
			userId: "u",
			sessionId: undefined,
			filename: "f",
			version: 1,
		});
	});
});
