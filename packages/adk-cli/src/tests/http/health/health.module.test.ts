import "reflect-metadata";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { HealthController } from "../../../http/health/health.controller";
import { HealthModule } from "../../../http/health/health.module";

describe("HealthModule", () => {
	it("registers HealthController", () => {
		const controllers = Reflect.getMetadata(
			MODULE_METADATA.CONTROLLERS,
			HealthModule,
		);
		expect(controllers).toEqual([HealthController]);
	});
});
