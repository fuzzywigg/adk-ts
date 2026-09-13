import { describe, expect, it } from "vitest";
import { TOKENS } from "../../../common/tokens";
import { ConfigModule } from "../../../http/config/config.module";
import { RUNTIME_CONFIG } from "../../../http/runtime-config";

describe("ConfigModule", () => {
	it("registers runtime config providers and exports", () => {
		const config = {
			host: "127.0.0.1",
			port: 4000,
			agentsDir: "/tmp/agents",
			quiet: true,
		};

		const dynamic = ConfigModule.register(config);

		expect(dynamic.module).toBe(ConfigModule);
		expect(dynamic.providers).toEqual([
			{ provide: RUNTIME_CONFIG, useValue: config },
			{ provide: TOKENS.AGENTS_DIR, useValue: "/tmp/agents" },
			{ provide: TOKENS.QUIET, useValue: true },
		]);
		expect(dynamic.exports).toEqual([
			RUNTIME_CONFIG,
			TOKENS.AGENTS_DIR,
			TOKENS.QUIET,
		]);
	});
});
