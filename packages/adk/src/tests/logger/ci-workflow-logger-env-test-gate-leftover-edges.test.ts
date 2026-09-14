import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Workflow contract (reversible assertion only): CI must keep running the
 * monorepo test entry so logger/env Vitest leftovers stay gated. Does not
 * invent jobs/templates — only asserts existing ci.yml steps.
 */
describe("CI workflow logger/env test gate leftover edges", () => {
	const ciYml = readFileSync(
		join(__dirname, "../../../../../.github/workflows/ci.yml"),
		"utf8",
	);

	it("ci.yml still runs pnpm test after build", () => {
		expect(ciYml).toMatch(/^\s+- name: Test\s*$/m);
		expect(ciYml).toMatch(/^\s+run: pnpm test\s*$/m);
		const testIdx = ciYml.indexOf("run: pnpm test");
		const buildIdx = ciYml.indexOf("run: pnpm build");
		expect(buildIdx).toBeGreaterThan(-1);
		expect(testIdx).toBeGreaterThan(buildIdx);
	});

	it("ci.yml still installs with frozen lockfile (reproducible env)", () => {
		expect(ciYml).toContain("pnpm install --frozen-lockfile");
	});

	it("ci.yml pins Node 22 matching package engines for env-sensitive Vitest", () => {
		expect(ciYml).toMatch(/node-version:\s*22\b/);
	});

	it("ci.yml still runs ADK coverage after pnpm test (logger leftovers stay gated)", () => {
		const testIdx = ciYml.indexOf("run: pnpm test");
		const coverageIdx = ciYml.indexOf("pnpm --filter @iqai/adk test:coverage");
		expect(coverageIdx).toBeGreaterThan(testIdx);
	});
});
