import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCompactionForSlidingWindow } from "../../events/compaction.js";
import type { EventsCompactionConfig } from "../../events/compaction-config.js";
import { Event } from "../../events/event.js";
import { EventActions } from "../../events/event-actions.js";
import type { EventsSummarizer } from "../../events/events-summarizer.js";
import { InMemorySessionService } from "../../sessions/in-memory-session-service.js";
import type { Session } from "../../sessions/session.js";

describe("compaction fourth leftover — timestamp 0 / interval / overlap matrices", () => {
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

	const appendPlain = async (
		invocationId: string,
		timestamp: number,
		text = invocationId,
	) => {
		await sessionService.appendEvent(
			session,
			new Event({
				invocationId,
				author: "agent",
				content: { parts: [{ text }] },
				timestamp,
			}),
		);
	};

	const appendCompaction = async (
		invocationId: string,
		endTimestamp: number,
		startTimestamp = 0,
	) => {
		await sessionService.appendEvent(
			session,
			new Event({
				invocationId,
				author: "user",
				timestamp: endTimestamp,
				actions: new EventActions({
					compaction: {
						startTimestamp,
						endTimestamp,
						compactedContent: {
							role: "model",
							parts: [{ text: "prior" }],
						},
					},
				}),
			}),
		);
	};

	describe("timestamp 0 falsy arms", () => {
		it("skips compaction when all events have timestamp 0 (never > lastCompacted)", async () => {
			for (let i = 0; i < 4; i++) {
				await appendPlain(`z-${i}`, 0);
			}
			session = await refreshSession(session);
			await runCompactionForSlidingWindow(
				{ compactionInterval: 1, overlapSize: 0 },
				session,
				sessionService,
				mockSummarizer,
			);
			expect(mockSummarizer.maybeSummarizeEvents).not.toHaveBeenCalled();
		});

		it("counts only positive timestamps when mixed with zeros", async () => {
			await appendPlain("zero", 0);
			await appendPlain("a", 10);
			await appendPlain("b", 20);
			session = await refreshSession(session);
			await runCompactionForSlidingWindow(
				{ compactionInterval: 2, overlapSize: 0 },
				session,
				sessionService,
				mockSummarizer,
			);
			expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalledTimes(1);
		});

		it("same invocation upgrades from 0 to positive in buildLatest map", async () => {
			await appendPlain("same", 0);
			await appendPlain("same", 5);
			await appendPlain("other", 6);
			session = await refreshSession(session);
			await runCompactionForSlidingWindow(
				{ compactionInterval: 2, overlapSize: 0 },
				session,
				sessionService,
				mockSummarizer,
			);
			expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalled();
		});

		it("prior compaction endTimestamp 0 still allows later positives", async () => {
			await appendCompaction("c0", 0);
			await appendPlain("n0", 1);
			await appendPlain("n1", 2);
			session = await refreshSession(session);
			await runCompactionForSlidingWindow(
				{ compactionInterval: 2, overlapSize: 0 },
				session,
				sessionService,
				mockSummarizer,
			);
			expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalledTimes(1);
		});

		it("forces Map.get || 0 arm so (0||0) > lastEnd fails", async () => {
			for (let i = 0; i < 3; i++) {
				await appendPlain(`u-${i}`, 100 + i);
			}
			session = await refreshSession(session);

			const originalGet = Map.prototype.get;
			Map.prototype.get = function (this: Map<unknown, unknown>, key: unknown) {
				const value = originalGet.call(this, key);
				if (
					typeof key === "string" &&
					key.startsWith("u-") &&
					typeof value === "number"
				) {
					return 0;
				}
				return value;
			};

			try {
				await runCompactionForSlidingWindow(
					{ compactionInterval: 3, overlapSize: 0 },
					session,
					sessionService,
					mockSummarizer,
				);
			} finally {
				Map.prototype.get = originalGet;
			}

			expect(mockSummarizer.maybeSummarizeEvents).not.toHaveBeenCalled();
		});

		it("empty invocationId events are skipped from the map", async () => {
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "",
					author: "agent",
					content: { parts: [{ text: "no-id" }] },
					timestamp: 50,
				}),
			);
			await appendPlain("kept", 60);
			session = await refreshSession(session);
			await runCompactionForSlidingWindow(
				{ compactionInterval: 1, overlapSize: 0 },
				session,
				sessionService,
				mockSummarizer,
			);
			expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalledTimes(1);
			const args = (mockSummarizer.maybeSummarizeEvents as any).mock
				.calls[0][0] as Event[];
			expect(args.every((e) => e.invocationId === "kept")).toBe(true);
		});
	});

	describe("interval × overlap matrices", () => {
		const matrix: Array<{
			label: string;
			interval: number;
			overlap: number;
			invocationCount: number;
			shouldCompact: boolean;
		}> = [
			{
				label: "interval 1 overlap 0 with 1 inv",
				interval: 1,
				overlap: 0,
				invocationCount: 1,
				shouldCompact: true,
			},
			{
				label: "interval 2 overlap 0 with 1 inv",
				interval: 2,
				overlap: 0,
				invocationCount: 1,
				shouldCompact: false,
			},
			{
				label: "interval 2 overlap 0 with 2 inv",
				interval: 2,
				overlap: 0,
				invocationCount: 2,
				shouldCompact: true,
			},
			{
				label: "interval 3 overlap 1 with 3 inv",
				interval: 3,
				overlap: 1,
				invocationCount: 3,
				shouldCompact: true,
			},
			{
				label: "interval 3 overlap 2 with 2 inv",
				interval: 3,
				overlap: 2,
				invocationCount: 2,
				shouldCompact: false,
			},
			{
				label: "interval 2 overlap 5 clamps start",
				interval: 2,
				overlap: 5,
				invocationCount: 2,
				shouldCompact: true,
			},
			{
				label: "interval 4 overlap 0 with 4 inv",
				interval: 4,
				overlap: 0,
				invocationCount: 4,
				shouldCompact: true,
			},
			{
				label: "interval 5 overlap 1 with 4 inv",
				interval: 5,
				overlap: 1,
				invocationCount: 4,
				shouldCompact: false,
			},
		];

		for (const row of matrix) {
			it(row.label, async () => {
				for (let i = 0; i < row.invocationCount; i++) {
					await appendPlain(`inv-${i}`, 1000 + i * 10);
				}
				session = await refreshSession(session);
				const config: EventsCompactionConfig = {
					compactionInterval: row.interval,
					overlapSize: row.overlap,
				};
				await runCompactionForSlidingWindow(
					config,
					session,
					sessionService,
					mockSummarizer,
				);
				if (row.shouldCompact) {
					expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalled();
				} else {
					expect(mockSummarizer.maybeSummarizeEvents).not.toHaveBeenCalled();
				}
			});
		}

		it("overlap includes prior invocations in summarized window", async () => {
			for (let i = 0; i < 4; i++) {
				await appendPlain(`h-${i}`, 100 + i);
			}
			session = await refreshSession(session);
			await runCompactionForSlidingWindow(
				{ compactionInterval: 2, overlapSize: 2 },
				session,
				sessionService,
				mockSummarizer,
			);
			expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalled();
			const compacted = (mockSummarizer.maybeSummarizeEvents as any).mock
				.calls[0][0] as Event[];
			const ids = compacted.map((e) => e.invocationId);
			expect(ids[0]).toBe("h-0");
			expect(ids[ids.length - 1]).toBe("h-3");
		});

		it("after prior compaction only new invocations count toward interval", async () => {
			for (let i = 0; i < 3; i++) {
				await appendPlain(`old-${i}`, 10 + i);
			}
			await appendCompaction("c-old", 12, 10);
			await appendPlain("new-0", 20);
			session = await refreshSession(session);
			await runCompactionForSlidingWindow(
				{ compactionInterval: 2, overlapSize: 0 },
				session,
				sessionService,
				mockSummarizer,
			);
			expect(mockSummarizer.maybeSummarizeEvents).not.toHaveBeenCalled();

			await appendPlain("new-1", 21);
			session = await refreshSession(session);
			await runCompactionForSlidingWindow(
				{ compactionInterval: 2, overlapSize: 1 },
				session,
				sessionService,
				mockSummarizer,
			);
			expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalledTimes(1);
		});

		it("returns early when summarizer yields undefined", async () => {
			(mockSummarizer.maybeSummarizeEvents as any).mockResolvedValue(undefined);
			for (let i = 0; i < 2; i++) {
				await appendPlain(`x-${i}`, 30 + i);
			}
			session = await refreshSession(session);
			await runCompactionForSlidingWindow(
				{ compactionInterval: 2, overlapSize: 0 },
				session,
				sessionService,
				mockSummarizer,
			);
			expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalledTimes(1);
			session = await refreshSession(session);
			expect(
				session.events?.some(
					(e) => e.actions?.compaction && e.invocationId === "compaction-inv",
				),
			).toBe(false);
		});

		it("no events / empty session is a no-op", async () => {
			await runCompactionForSlidingWindow(
				{ compactionInterval: 1, overlapSize: 0 },
				session,
				sessionService,
				mockSummarizer,
			);
			expect(mockSummarizer.maybeSummarizeEvents).not.toHaveBeenCalled();
		});
	});
});
