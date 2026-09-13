import "reflect-metadata";
import { InMemorySessionService } from "@iqai/adk";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { AgentGraphService } from "../../../http/providers/agent-graph.service";
import { AgentLoader } from "../../../http/providers/agent-loader.service";
import { AgentManager } from "../../../http/providers/agent-manager.service";
import { AgentScanner } from "../../../http/providers/agent-scanner.service";
import { ProvidersModule } from "../../../http/providers/providers.module";

describe("ProvidersModule", () => {
	it("exports core provider tokens", () => {
		const exports = Reflect.getMetadata(
			MODULE_METADATA.EXPORTS,
			ProvidersModule,
		);
		expect(exports).toEqual([
			InMemorySessionService,
			AgentScanner,
			AgentLoader,
			AgentManager,
			AgentGraphService,
		]);
	});

	it("registers provider factories for scanner, loader, and manager", () => {
		const providers = Reflect.getMetadata(
			MODULE_METADATA.PROVIDERS,
			ProvidersModule,
		) as Array<{ provide?: unknown; useFactory?: (...args: any[]) => unknown }>;

		expect(providers.some((p) => p === AgentGraphService)).toBe(true);

		const manager = providers.find((p) => p.provide === AgentManager);
		expect(manager?.useFactory).toBeTypeOf("function");
		const sessionService = new InMemorySessionService();
		const instance = manager?.useFactory?.(sessionService, true);
		expect(instance).toBeInstanceOf(AgentManager);
	});
});
