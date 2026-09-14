import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCompactionForSlidingWindow } from "../../events/compaction.js";
import type { EventsCompactionConfig } from "../../events/compaction-config.js";
import { Event } from "../../events/event.js";
import { EventActions } from "../../events/event-actions.js";
import type { EventsSummarizer } from "../../events/events-summarizer.js";
import { InMemorySessionService } from "../../sessions/in-memory-session-service.js";
import type { Session } from "../../sessions/session.js";

describe("compaction leftover timestamp || 0 edges", () => {
	let sessionService: InMemorySessionService;
	let mockSummarizer: EventsSummarizer;
	let session: Session;

	const refreshSession = async (s: Session): Promise<Session> => {
		const refreshed = await sessionService.getSession(
			s.appName,
			s.userId,
			s.id,
		);
		return refreshed!;
	};

	beforeEach(async () => {
		sessionService = new InMemorySessionService();
		session = await sessionService.createSession("test-app", "test-user");
		mockSummarizer = {
			maybeSummarizeEvents: vi.fn().mockResolvedValue(
				new Event({
					invocationId: "compaction-inv",
					author: "user",
					actions: new EventActions({
						compaction: {
							startTimestamp: 1,
							endTimestamp: 2,
							compactedContent: {
								role: "model",
								parts: [{ text: "Summary" }],
							},
						},
					}),
				}),
			),
		};
	});

	it("hits || 0 when Map.get returns falsy 0 during new-invocation filter", async () => {
		const config: EventsCompactionConfig = {
			compactionInterval: 2,
			overlapSize: 0,
		};

		await sessionService.appendEvent(
			session,
			new Event({
				invocationId: "prior",
				author: "user",
				timestamp: 0,
				actions: new EventActions({
					compaction: {
						startTimestamp: -5,
						endTimestamp: -1,
						compactedContent: {
							role: "model",
							parts: [{ text: "prior" }],
						},
					},
				}),
			}),
		);

		for (let i = 0; i < 2; i++) {
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: `inv-${i}`,
					author: "agent",
					content: { parts: [{ text: `m${i}` }] },
					timestamp: 10 + i,
				}),
			);
		}

		session = await refreshSession(session);

		const originalGet = Map.prototype.get;
		Map.prototype.get = function (this: Map<unknown, unknown>, key: unknown) {
			const value = originalGet.call(this, key);
			if (typeof value === "number" && value > 0) {
				return 0;
			}
			return value;
		};

		try {
			await runCompactionForSlidingWindow(
				config,
				session,
				sessionService,
				mockSummarizer,
			);
		} finally {
			Map.prototype.get = originalGet;
		}

		// With forced 0 timestamps: (0 || 0) > -1 is true, so compaction proceeds.
		expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalledTimes(1);
	});

	it("timestamp 0 events never enter the invocation map alone", async () => {
		const config: EventsCompactionConfig = {
			compactionInterval: 1,
			overlapSize: 0,
		};

		for (let i = 0; i < 3; i++) {
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: `zero-${i}`,
					author: "agent",
					content: { parts: [{ text: `z${i}` }] },
					timestamp: 0,
				}),
			);
		}

		session = await refreshSession(session);
		await runCompactionForSlidingWindow(
			config,
			session,
			sessionService,
			mockSummarizer,
		);

		expect(mockSummarizer.maybeSummarizeEvents).not.toHaveBeenCalled();
	});

	const timestampZeroMatrix: Array<{
		label: string;
		events: Array<{
			invocationId: string;
			timestamp: number;
			compaction?: boolean;
		}>;
		interval: number;
		shouldCompact: boolean;
	}> = [
		{
			label: "mixed zero and positive — only positive count",
			events: [
				{ invocationId: "z", timestamp: 0 },
				{ invocationId: "a", timestamp: 1 },
				{ invocationId: "b", timestamp: 2 },
			],
			interval: 2,
			shouldCompact: true,
		},
		{
			label: "all zeros below interval",
			events: [
				{ invocationId: "z0", timestamp: 0 },
				{ invocationId: "z1", timestamp: 0 },
			],
			interval: 1,
			shouldCompact: false,
		},
		{
			label: "zero then same inv with positive stores positive",
			events: [
				{ invocationId: "same", timestamp: 0 },
				{ invocationId: "same", timestamp: 5 },
				{ invocationId: "other", timestamp: 6 },
			],
			interval: 2,
			shouldCompact: true,
		},
		{
			label: "buildLatest || 0 first-seen path with positive timestamps",
			events: [
				{ invocationId: "i0", timestamp: 1 },
				{ invocationId: "i1", timestamp: 2 },
				{ invocationId: "i2", timestamp: 3 },
			],
			interval: 3,
			shouldCompact: true,
		},
		{
			label: "prior compaction end 0 with later positives",
			events: [
				{ invocationId: "c", timestamp: 0, compaction: true },
				{ invocationId: "n0", timestamp: 1 },
				{ invocationId: "n1", timestamp: 2 },
			],
			interval: 2,
			shouldCompact: true,
		},
	];

	for (const {
		label,
		events,
		interval,
		shouldCompact,
	} of timestampZeroMatrix) {
		it(`matrix: ${label}`, async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: interval,
				overlapSize: 0,
			};

			for (const e of events) {
				if (e.compaction) {
					await sessionService.appendEvent(
						session,
						new Event({
							invocationId: e.invocationId,
							author: "user",
							timestamp: e.timestamp,
							actions: new EventActions({
								compaction: {
									startTimestamp: 0,
									endTimestamp: 0,
									compactedContent: {
										role: "model",
										parts: [{ text: "prior" }],
									},
								},
							}),
						}),
					);
				} else {
					await sessionService.appendEvent(
						session,
						new Event({
							invocationId: e.invocationId,
							author: "agent",
							content: { parts: [{ text: e.invocationId }] },
							timestamp: e.timestamp,
						}),
					);
				}
			}

			session = await refreshSession(session);
			await runCompactionForSlidingWindow(
				config,
				session,
				sessionService,
				mockSummarizer,
			);

			if (shouldCompact) {
				expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalled();
			} else {
				expect(mockSummarizer.maybeSummarizeEvents).not.toHaveBeenCalled();
			}
		});
	}

	it("forces || 0 arm on line 36 for each unique invocation id", async () => {
		const config: EventsCompactionConfig = {
			compactionInterval: 3,
			overlapSize: 0,
		};

		for (let i = 0; i < 3; i++) {
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: `u-${i}`,
					author: "agent",
					content: { parts: [{ text: `t${i}` }] },
					timestamp: 100 + i,
				}),
			);
		}
		session = await refreshSession(session);

		let sawFalsyGet = false;
		const originalGet = Map.prototype.get;
		Map.prototype.get = function (this: Map<unknown, unknown>, key: unknown) {
			const value = originalGet.call(this, key);
			if (
				typeof key === "string" &&
				key.startsWith("u-") &&
				typeof value === "number"
			) {
				sawFalsyGet = true;
				return 0;
			}
			return value;
		};

		try {
			await runCompactionForSlidingWindow(
				config,
				session,
				sessionService,
				mockSummarizer,
			);
		} finally {
			Map.prototype.get = originalGet;
		}

		expect(sawFalsyGet).toBe(true);
		// (0 || 0) > 0 is false → not enough new invocations
		expect(mockSummarizer.maybeSummarizeEvents).not.toHaveBeenCalled();
	});
});
