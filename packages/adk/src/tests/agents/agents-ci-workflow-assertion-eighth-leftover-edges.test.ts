import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Eighth leftover: reversible workflow assertion — CI must still invoke
 * the monorepo test script that exercises agents leftover Vitest.
 * Does not invent jobs; only pins existing ci.yml contract.
 */
describe("agents edges CI workflow assertion eighth leftover", () => {
	const here = dirname(fileURLToPath(import.meta.url));
	const ciYml = readFileSync(
		resolve(here, "../../../../../.github/workflows/ci.yml"),
		"utf8",
	);

	it("build-and-test job runs pnpm test", () => {
		expect(ciYml).toMatch(/name:\s*Test/);
		expect(ciYml).toMatch(/run:\s*pnpm test/);
	});

	it("build-and-test job runs pnpm build before test", () => {
		expect(ciYml).toMatch(/name:\s*Build/);
		expect(ciYml).toMatch(/run:\s*pnpm build/);
		const buildAt = ciYml.indexOf("run: pnpm build");
		const testAt = ciYml.indexOf("run: pnpm test");
		expect(buildAt).toBeGreaterThan(-1);
		expect(testAt).toBeGreaterThan(buildAt);
	});
});
