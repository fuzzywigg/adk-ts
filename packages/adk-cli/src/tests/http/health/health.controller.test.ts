import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HealthController } from "../../../http/health/health.controller";

describe("HealthController", () => {
	it("returns ok status and package version", () => {
		const pkg = JSON.parse(
			readFileSync(join(__dirname, "../../../../package.json"), "utf-8"),
		) as { version: string };
		const controller = new HealthController();
		expect(controller.health()).toEqual({
			status: "ok",
			version: pkg.version,
		});
	});
});
