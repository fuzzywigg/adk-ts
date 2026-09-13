import "reflect-metadata";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { ConfigModule } from "../../http/config/config.module";
import { AgentsController } from "../../http/discovery/agents.controller";
import { DiscoveryModule } from "../../http/discovery/discovery.module";
import { GraphController } from "../../http/discovery/graph.controller";
import { EventsController } from "../../http/events/events.controller";
import { EventsModule } from "../../http/events/events.module";
import { EventsService } from "../../http/events/events.service";
import { HealthModule } from "../../http/health/health.module";
import { HttpModule } from "../../http/http.module";
import { MessagingController } from "../../http/messaging/messaging.controller";
import { MessagingModule } from "../../http/messaging/messaging.module";
import { MessagingService } from "../../http/messaging/messaging.service";
import { ProvidersModule } from "../../http/providers/providers.module";
import { HotReloadService } from "../../http/reload/hot-reload.service";
import { ReloadController } from "../../http/reload/reload.controller";
import { ReloadModule } from "../../http/reload/reload.module";
import { SessionsController } from "../../http/sessions/sessions.controller";
import { SessionsModule } from "../../http/sessions/sessions.module";
import { SessionsService } from "../../http/sessions/sessions.service";
import { StateController } from "../../http/state/state.controller";
import { StateModule } from "../../http/state/state.module";
import { StateService } from "../../http/state/state.service";

describe("Http Nest modules", () => {
	it("HttpModule.register wires feature modules", () => {
		const config = {
			agentsDir: "/tmp/agents",
			port: 8042,
			host: "localhost",
			quiet: true,
		} as any;
		const dynamic = HttpModule.register(config);

		expect(dynamic.module).toBe(HttpModule);
		expect(dynamic.imports).toHaveLength(9);
		expect(dynamic.imports?.[0]).toEqual(ConfigModule.register(config));
		expect(dynamic.imports?.slice(1)).toEqual([
			ProvidersModule,
			DiscoveryModule,
			MessagingModule,
			SessionsModule,
			EventsModule,
			StateModule,
			ReloadModule,
			HealthModule,
		]);
	});

	it("DiscoveryModule registers agent/graph controllers", () => {
		expect(
			Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, DiscoveryModule),
		).toEqual([AgentsController, GraphController]);
		expect(
			Reflect.getMetadata(MODULE_METADATA.IMPORTS, DiscoveryModule),
		).toEqual([ProvidersModule]);
	});

	it("SessionsModule exports SessionsService", () => {
		expect(
			Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, SessionsModule),
		).toEqual([SessionsController]);
		expect(
			Reflect.getMetadata(MODULE_METADATA.PROVIDERS, SessionsModule),
		).toEqual([SessionsService]);
		expect(
			Reflect.getMetadata(MODULE_METADATA.EXPORTS, SessionsModule),
		).toEqual([SessionsService]);
	});

	it("MessagingModule, EventsModule, and StateModule wire controllers", () => {
		expect(
			Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, MessagingModule),
		).toEqual([MessagingController]);
		expect(
			Reflect.getMetadata(MODULE_METADATA.PROVIDERS, MessagingModule),
		).toEqual([MessagingService]);

		expect(
			Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, EventsModule),
		).toEqual([EventsController]);
		expect(
			Reflect.getMetadata(MODULE_METADATA.PROVIDERS, EventsModule),
		).toEqual([EventsService]);

		expect(
			Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, StateModule),
		).toEqual([StateController]);
		expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, StateModule)).toEqual(
			[StateService],
		);
	});

	it("ReloadModule exports HotReloadService", () => {
		expect(
			Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, ReloadModule),
		).toEqual([ReloadController]);
		expect(
			Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ReloadModule),
		).toEqual([HotReloadService]);
		expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, ReloadModule)).toEqual([
			HotReloadService,
		]);
	});
});
