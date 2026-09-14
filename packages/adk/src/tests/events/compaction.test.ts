import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCompactionForSlidingWindow } from "../../events/compaction.js";
import type { EventsCompactionConfig } from "../../events/compaction-config.js";
import { Event } from "../../events/event.js";
import { EventActions } from "../../events/event-actions.js";
import type { EventsSummarizer } from "../../events/events-summarizer.js";
import { InMemorySessionService } from "../../sessions/in-memory-session-service.js";
import type { Session } from "../../sessions/session.js";

describe("Event Compaction", () => {
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
							startTimestamp: 1000,
							endTimestamp: 2000,
							compactedContent: {
								role: "model",
								parts: [{ text: "Summary of events" }],
							},
						},
					}),
				}),
			),
		};
	});

	describe("runCompactionForSlidingWindow", () => {
		it("should not compact when there are no events", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 5,
				overlapSize: 2,
			};

			await runCompactionForSlidingWindow(
				config,
				session,
				sessionService,
				mockSummarizer,
			);

			expect(mockSummarizer.maybeSummarizeEvents).not.toHaveBeenCalled();
		});

		it("should not compact when there are fewer events than compactionInterval", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 5,
				overlapSize: 2,
			};

			for (let i = 0; i < 3; i++) {
				const event = new Event({
					invocationId: `inv-${i}`,
					author: "agent",
					content: { parts: [{ text: `Message ${i}` }] },
					timestamp: 1000 + i * 100,
				});
				await sessionService.appendEvent(session, event);
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

		it("should compact when enough new invocations have accumulated", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 5,
				overlapSize: 2,
			};

			for (let i = 0; i < 6; i++) {
				const event = new Event({
					invocationId: `inv-${i}`,
					author: "agent",
					content: { parts: [{ text: `Message ${i}` }] },
					timestamp: 1000 + i * 100,
				});
				await sessionService.appendEvent(session, event);
			}

			session = await refreshSession(session);

			await runCompactionForSlidingWindow(
				config,
				session,
				sessionService,
				mockSummarizer,
			);

			expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalledTimes(1);

			const calledWithEvents = (mockSummarizer.maybeSummarizeEvents as any).mock
				.calls[0][0] as Event[];
			expect(calledWithEvents.length).toBeGreaterThan(0);
		});

		it("should include overlap events in compaction", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 3,
				overlapSize: 2,
			};

			for (let i = 0; i < 5; i++) {
				const event = new Event({
					invocationId: `inv-${i}`,
					author: "agent",
					content: { parts: [{ text: `Message ${i}` }] },
					timestamp: 1000 + i * 100,
				});
				await sessionService.appendEvent(session, event);
			}

			session = await refreshSession(session);

			await runCompactionForSlidingWindow(
				config,
				session,
				sessionService,
				mockSummarizer,
			);

			expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalled();

			const calledWithEvents = (mockSummarizer.maybeSummarizeEvents as any).mock
				.calls[0][0] as Event[];
			expect(calledWithEvents.length).toBeGreaterThanOrEqual(3);
		});

		it("should not compact already compacted events again", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 3,
				overlapSize: 1,
			};

			for (let i = 0; i < 4; i++) {
				const event = new Event({
					invocationId: `inv-${i}`,
					author: "agent",
					content: { parts: [{ text: `Message ${i}` }] },
					timestamp: 1000 + i * 100,
				});
				await sessionService.appendEvent(session, event);
			}

			const compactionEvent = new Event({
				invocationId: "compaction-inv",
				author: "user",
				actions: new EventActions({
					compaction: {
						startTimestamp: 1000,
						endTimestamp: 1300,
						compactedContent: {
							role: "model",
							parts: [{ text: "Previous summary" }],
						},
					},
				}),
				timestamp: 1400,
			});
			await sessionService.appendEvent(session, compactionEvent);

			for (let i = 4; i < 7; i++) {
				const event = new Event({
					invocationId: `inv-${i}`,
					author: "agent",
					content: { parts: [{ text: `Message ${i}` }] },
					timestamp: 1500 + i * 100,
				});
				await sessionService.appendEvent(session, event);
			}

			session = await refreshSession(session);

			vi.clearAllMocks();

			await runCompactionForSlidingWindow(
				config,
				session,
				sessionService,
				mockSummarizer,
			);

			expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalled();

			const calledWithEvents = (mockSummarizer.maybeSummarizeEvents as any).mock
				.calls[0][0] as Event[];

			const hasCompactionEvent = calledWithEvents.some(
				(e) => e.actions?.compaction,
			);
			expect(hasCompactionEvent).toBe(false);
		});

		it("should append compaction event to session", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 3,
				overlapSize: 1,
			};

			for (let i = 0; i < 4; i++) {
				const event = new Event({
					invocationId: `inv-${i}`,
					author: "agent",
					content: { parts: [{ text: `Message ${i}` }] },
					timestamp: 1000 + i * 100,
				});
				await sessionService.appendEvent(session, event);
			}

			session = await refreshSession(session);

			const initialEventCount = session.events?.length || 0;

			await runCompactionForSlidingWindow(
				config,
				session,
				sessionService,
				mockSummarizer,
			);

			session = await refreshSession(session);

			const finalEventCount = session.events?.length || 0;
			expect(finalEventCount).toBe(initialEventCount + 1);

			const lastEvent = session.events?.[session.events.length - 1];
			expect(lastEvent?.actions?.compaction).toBeDefined();
		});

		it("should handle empty events array gracefully", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 5,
				overlapSize: 2,
			};

			const emptySession = await sessionService.createSession(
				"test-app-2",
				"test-user-2",
			);

			await runCompactionForSlidingWindow(
				config,
				emptySession,
				sessionService,
				mockSummarizer,
			);

			expect(mockSummarizer.maybeSummarizeEvents).not.toHaveBeenCalled();
		});

		it("should respect compactionInterval setting", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 10,
				overlapSize: 2,
			};

			for (let i = 0; i < 9; i++) {
				const event = new Event({
					invocationId: `inv-${i}`,
					author: "agent",
					content: { parts: [{ text: `Message ${i}` }] },
					timestamp: 1000 + i * 100,
				});
				await sessionService.appendEvent(session, event);
			}

			session = await refreshSession(session);

			await runCompactionForSlidingWindow(
				config,
				session,
				sessionService,
				mockSummarizer,
			);

			expect(mockSummarizer.maybeSummarizeEvents).not.toHaveBeenCalled();

			const oneMoreEvent = new Event({
				invocationId: "inv-9",
				author: "agent",
				content: { parts: [{ text: "Message 9" }] },
				timestamp: 1900,
			});
			await sessionService.appendEvent(session, oneMoreEvent);

			session = await refreshSession(session);

			await runCompactionForSlidingWindow(
				config,
				session,
				sessionService,
				mockSummarizer,
			);

			expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalledTimes(1);
		});

		it("should not fail when summarizer returns undefined", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 3,
				overlapSize: 1,
			};

			const noOpSummarizer: EventsSummarizer = {
				maybeSummarizeEvents: vi.fn().mockResolvedValue(undefined),
			};

			for (let i = 0; i < 4; i++) {
				const event = new Event({
					invocationId: `inv-${i}`,
					author: "agent",
					content: { parts: [{ text: `Message ${i}` }] },
					timestamp: 1000 + i * 100,
				});
				await sessionService.appendEvent(session, event);
			}

			session = await refreshSession(session);

			const initialEventCount = session.events?.length || 0;

			await runCompactionForSlidingWindow(
				config,
				session,
				sessionService,
				noOpSummarizer,
			);

			session = await refreshSession(session);

			const finalEventCount = session.events?.length || 0;
			expect(finalEventCount).toBe(initialEventCount);
		});

		it("should handle multiple invocations with same timestamp", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 3,
				overlapSize: 1,
			};

			const timestamp = 1000;
			for (let i = 0; i < 4; i++) {
				const event = new Event({
					invocationId: `inv-${i}`,
					author: "agent",
					content: { parts: [{ text: `Message ${i}` }] },
					timestamp,
				});
				await sessionService.appendEvent(session, event);
			}

			session = await refreshSession(session);

			await runCompactionForSlidingWindow(
				config,
				session,
				sessionService,
				mockSummarizer,
			);

			expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalled();
		});

		it("ignores events without invocationId and excludes compaction carriers from the map", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 3,
				overlapSize: 0,
			};

			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "",
					author: "agent",
					content: { parts: [{ text: "no-id" }] },
					timestamp: 900,
				}),
			);

			for (let i = 0; i < 3; i++) {
				await sessionService.appendEvent(
					session,
					new Event({
						invocationId: `inv-${i}`,
						author: "agent",
						content: { parts: [{ text: `Message ${i}` }] },
						timestamp: 1000 + i * 100,
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

			expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalled();
			const summarizedEvents = (mockSummarizer.maybeSummarizeEvents as any).mock
				.calls[0][0] as Event[];
			expect(summarizedEvents.every((e) => !e.actions?.compaction)).toBe(true);
			expect(summarizedEvents.some((e) => !e.invocationId)).toBe(false);
		});

		it("uses overlapSize 0 starting at the first new invocation", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 2,
				overlapSize: 0,
			};

			for (let i = 0; i < 4; i++) {
				await sessionService.appendEvent(
					session,
					new Event({
						invocationId: `inv-${i}`,
						author: "agent",
						content: { parts: [{ text: `Message ${i}` }] },
						timestamp: 1000 + i * 100,
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

			const summarizedEvents = (mockSummarizer.maybeSummarizeEvents as any).mock
				.calls[0][0] as Event[];
			expect(summarizedEvents.map((e) => e.invocationId)).toEqual([
				"inv-0",
				"inv-1",
				"inv-2",
				"inv-3",
			]);
		});

		it("does not count compaction-only events toward the compaction interval", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 2,
				overlapSize: 0,
			};

			for (let i = 0; i < 3; i++) {
				await sessionService.appendEvent(
					session,
					new Event({
						invocationId: `carrier-${i}`,
						author: "user",
						timestamp: 1000 + i * 100,
						actions: new EventActions({
							compaction: {
								startTimestamp: 900 + i * 100,
								endTimestamp: 950 + i * 100,
								compactedContent: {
									role: "model",
									parts: [{ text: `carrier-${i}` }],
								},
							},
						}),
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

		it("uses the last compaction carrier endTimestamp when multiple exist", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 2,
				overlapSize: 0,
			};

			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "old-0",
					author: "agent",
					content: { parts: [{ text: "old" }] },
					timestamp: 500,
				}),
			);
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "compact-a",
					author: "user",
					timestamp: 600,
					actions: new EventActions({
						compaction: {
							startTimestamp: 500,
							endTimestamp: 550,
							compactedContent: {
								role: "model",
								parts: [{ text: "first compact" }],
							},
						},
					}),
				}),
			);
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "compact-b",
					author: "user",
					timestamp: 700,
					actions: new EventActions({
						compaction: {
							startTimestamp: 560,
							endTimestamp: 1000,
							compactedContent: {
								role: "model",
								parts: [{ text: "second compact wins" }],
							},
						},
					}),
				}),
			);

			for (let i = 0; i < 2; i++) {
				await sessionService.appendEvent(
					session,
					new Event({
						invocationId: `new-${i}`,
						author: "agent",
						content: { parts: [{ text: `new ${i}` }] },
						timestamp: 1100 + i * 50,
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

			expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalledTimes(1);
			const summarized = (mockSummarizer.maybeSummarizeEvents as any).mock
				.calls[0][0] as Event[];
			expect(summarized.map((e) => e.invocationId)).toEqual(["new-0", "new-1"]);
			expect(summarized.every((e) => e.timestamp > 1000)).toBe(true);
		});

		it("treats compaction-first same invocationId as firstIndex for slicing", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 2,
				overlapSize: 0,
			};

			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "inv-0",
					author: "user",
					timestamp: 900,
					actions: new EventActions({
						compaction: {
							startTimestamp: 800,
							endTimestamp: 850,
							compactedContent: {
								role: "model",
								parts: [{ text: "carrier first" }],
							},
						},
					}),
				}),
			);
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "inv-0",
					author: "agent",
					content: { parts: [{ text: "real inv-0" }] },
					timestamp: 1000,
				}),
			);
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "inv-1",
					author: "agent",
					content: { parts: [{ text: "real inv-1" }] },
					timestamp: 1100,
				}),
			);

			session = await refreshSession(session);
			await runCompactionForSlidingWindow(
				config,
				session,
				sessionService,
				mockSummarizer,
			);

			expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalled();
			const summarized = (mockSummarizer.maybeSummarizeEvents as any).mock
				.calls[0][0] as Event[];
			expect(summarized.map((e) => e.content?.parts?.[0]?.text)).toEqual([
				"real inv-0",
				"real inv-1",
			]);
			expect(summarized.every((e) => !e.actions?.compaction)).toBe(true);
		});

		it("keeps latest timestamp per invocation across multiple events", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 2,
				overlapSize: 0,
			};

			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "inv-0",
					author: "agent",
					content: { parts: [{ text: "early" }] },
					timestamp: 1000,
				}),
			);
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "inv-0",
					author: "agent",
					content: { parts: [{ text: "late" }] },
					timestamp: 1500,
				}),
			);
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "inv-1",
					author: "agent",
					content: { parts: [{ text: "second" }] },
					timestamp: 1600,
				}),
			);

			session = await refreshSession(session);
			await runCompactionForSlidingWindow(
				config,
				session,
				sessionService,
				mockSummarizer,
			);

			expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalled();
			const summarized = (mockSummarizer.maybeSummarizeEvents as any).mock
				.calls[0][0] as Event[];
			expect(summarized).toHaveLength(3);
			expect(summarized.filter((e) => e.invocationId === "inv-0")).toHaveLength(
				2,
			);
		});

		it("no-ops when session.events is undefined", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 1,
				overlapSize: 0,
			};
			const bare = {
				appName: "x",
				userId: "y",
				id: "z",
				state: {},
				lastUpdateTime: 0,
			} as Session;

			await runCompactionForSlidingWindow(
				config,
				bare,
				sessionService,
				mockSummarizer,
			);
			expect(mockSummarizer.maybeSummarizeEvents).not.toHaveBeenCalled();
		});

		it("does not compact when new invocations equal interval after a prior compact end", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 3,
				overlapSize: 0,
			};

			for (let i = 0; i < 2; i++) {
				await sessionService.appendEvent(
					session,
					new Event({
						invocationId: `old-${i}`,
						author: "agent",
						content: { parts: [{ text: `old ${i}` }] },
						timestamp: 100 + i,
					}),
				);
			}
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "compact",
					author: "user",
					timestamp: 200,
					actions: new EventActions({
						compaction: {
							startTimestamp: 100,
							endTimestamp: 500,
							compactedContent: {
								role: "model",
								parts: [{ text: "done" }],
							},
						},
					}),
				}),
			);
			for (let i = 0; i < 2; i++) {
				await sessionService.appendEvent(
					session,
					new Event({
						invocationId: `new-${i}`,
						author: "agent",
						content: { parts: [{ text: `new ${i}` }] },
						timestamp: 600 + i,
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

		it("excludes invocations whose latest timestamp equals lastCompactedEndTimestamp", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 2,
				overlapSize: 0,
			};

			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "old-inv",
					author: "agent",
					content: { parts: [{ text: "old" }] },
					timestamp: 500,
				}),
			);
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "compact",
					author: "user",
					timestamp: 1000,
					actions: new EventActions({
						compaction: {
							startTimestamp: 500,
							endTimestamp: 1000,
							compactedContent: {
								role: "model",
								parts: [{ text: "prior" }],
							},
						},
					}),
				}),
			);
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "same-ts",
					author: "agent",
					content: { parts: [{ text: "boundary" }] },
					timestamp: 1000,
				}),
			);
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "new-1",
					author: "agent",
					content: { parts: [{ text: "n1" }] },
					timestamp: 1001,
				}),
			);
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "new-2",
					author: "agent",
					content: { parts: [{ text: "n2" }] },
					timestamp: 1002,
				}),
			);

			session = await refreshSession(session);
			await runCompactionForSlidingWindow(
				config,
				session,
				sessionService,
				mockSummarizer,
			);

			expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalledTimes(1);
			const compacted = (mockSummarizer.maybeSummarizeEvents as any).mock
				.calls[0][0] as Event[];
			const invIds = [...new Set(compacted.map((e) => e.invocationId))];
			expect(invIds).toEqual(["new-1", "new-2"]);
			expect(invIds).not.toContain("same-ts");
		});

		it("clamps overlapSize when it exceeds available prior invocations", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 2,
				overlapSize: 10,
			};

			for (let i = 0; i < 3; i++) {
				await sessionService.appendEvent(
					session,
					new Event({
						invocationId: `inv-${i}`,
						author: "agent",
						content: { parts: [{ text: `m${i}` }] },
						timestamp: 1000 + i,
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

			expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalledTimes(1);
			const compacted = (mockSummarizer.maybeSummarizeEvents as any).mock
				.calls[0][0] as Event[];
			expect([...new Set(compacted.map((e) => e.invocationId))]).toEqual([
				"inv-0",
				"inv-1",
				"inv-2",
			]);
		});

		it("includes exact overlap invocation after a prior compaction window", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 3,
				overlapSize: 1,
			};

			for (let i = 0; i < 3; i++) {
				await sessionService.appendEvent(
					session,
					new Event({
						invocationId: `inv-${i}`,
						author: "agent",
						content: { parts: [{ text: `early ${i}` }] },
						timestamp: 100 + i,
					}),
				);
			}
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "compact",
					author: "user",
					timestamp: 200,
					actions: new EventActions({
						compaction: {
							startTimestamp: 100,
							endTimestamp: 102,
							compactedContent: {
								role: "model",
								parts: [{ text: "early summary" }],
							},
						},
					}),
				}),
			);
			for (let i = 3; i < 6; i++) {
				await sessionService.appendEvent(
					session,
					new Event({
						invocationId: `inv-${i}`,
						author: "agent",
						content: { parts: [{ text: `late ${i}` }] },
						timestamp: 300 + i,
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

			expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalledTimes(1);
			const compacted = (mockSummarizer.maybeSummarizeEvents as any).mock
				.calls[0][0] as Event[];
			const invIds = [...new Set(compacted.map((e) => e.invocationId))];
			expect(invIds).toEqual(["inv-2", "inv-3", "inv-4", "inv-5"]);
			expect(invIds).not.toContain("compact");
			expect(invIds).not.toContain("inv-0");
			expect(invIds).not.toContain("inv-1");
		});

		it("never triggers when every post-compact invocation is only at the endTimestamp boundary", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 2,
				overlapSize: 0,
			};
			const boundary = 2000;

			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "seed",
					author: "agent",
					content: { parts: [{ text: "seed" }] },
					timestamp: 100,
				}),
			);
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "compact",
					author: "user",
					timestamp: boundary,
					actions: new EventActions({
						compaction: {
							startTimestamp: 100,
							endTimestamp: boundary,
							compactedContent: {
								role: "model",
								parts: [{ text: "done" }],
							},
						},
					}),
				}),
			);
			for (let i = 0; i < 5; i++) {
				await sessionService.appendEvent(
					session,
					new Event({
						invocationId: `eq-${i}`,
						author: "agent",
						content: { parts: [{ text: `eq ${i}` }] },
						timestamp: boundary,
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

		it("treats an invocation as new only after its latest timestamp crosses compact end via >", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 1,
				overlapSize: 0,
			};
			const boundary = 1500;

			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "cross",
					author: "agent",
					content: { parts: [{ text: "early" }] },
					timestamp: boundary - 100,
				}),
			);
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "compact",
					author: "user",
					timestamp: boundary,
					actions: new EventActions({
						compaction: {
							startTimestamp: boundary - 100,
							endTimestamp: boundary,
							compactedContent: {
								role: "model",
								parts: [{ text: "prior" }],
							},
						},
					}),
				}),
			);
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "cross",
					author: "agent",
					content: { parts: [{ text: "late equals" }] },
					timestamp: boundary,
				}),
			);

			session = await refreshSession(session);
			vi.clearAllMocks();
			await runCompactionForSlidingWindow(
				config,
				session,
				sessionService,
				mockSummarizer,
			);
			expect(mockSummarizer.maybeSummarizeEvents).not.toHaveBeenCalled();

			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "cross",
					author: "agent",
					content: { parts: [{ text: "late greater" }] },
					timestamp: boundary + 1,
				}),
			);
			session = await refreshSession(session);
			await runCompactionForSlidingWindow(
				config,
				session,
				sessionService,
				mockSummarizer,
			);

			expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalledTimes(1);
			const compacted = (mockSummarizer.maybeSummarizeEvents as any).mock
				.calls[0][0] as Event[];
			expect(compacted.map((e) => e.invocationId)).toEqual([
				"cross",
				"cross",
				"cross",
			]);
			expect(compacted.map((e) => e.content?.parts?.[0]?.text)).toEqual([
				"early",
				"late equals",
				"late greater",
			]);
		});

		it("clamps oversized overlapSize after prior compaction to the first unique invocation", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 2,
				overlapSize: 99,
			};

			for (let i = 0; i < 2; i++) {
				await sessionService.appendEvent(
					session,
					new Event({
						invocationId: `old-${i}`,
						author: "agent",
						content: { parts: [{ text: `old ${i}` }] },
						timestamp: 100 + i,
					}),
				);
			}
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "compact",
					author: "user",
					timestamp: 250,
					actions: new EventActions({
						compaction: {
							startTimestamp: 100,
							endTimestamp: 200,
							compactedContent: {
								role: "model",
								parts: [{ text: "old summary" }],
							},
						},
					}),
				}),
			);
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "new-0",
					author: "agent",
					content: { parts: [{ text: "new 0" }] },
					timestamp: 300,
				}),
			);
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "new-1",
					author: "agent",
					content: { parts: [{ text: "new 1" }] },
					timestamp: 400,
				}),
			);

			session = await refreshSession(session);
			await runCompactionForSlidingWindow(
				config,
				session,
				sessionService,
				mockSummarizer,
			);

			expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalledTimes(1);
			const compacted = (mockSummarizer.maybeSummarizeEvents as any).mock
				.calls[0][0] as Event[];
			expect(compacted.map((e) => e.invocationId)).toEqual([
				"old-0",
				"old-1",
				"new-0",
				"new-1",
			]);
			expect(compacted.every((e) => !e.actions?.compaction)).toBe(true);
		});

		it("selects exact overlapSize-2 invocationId window after prior compaction", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 2,
				overlapSize: 2,
			};

			for (let i = 0; i < 5; i++) {
				await sessionService.appendEvent(
					session,
					new Event({
						invocationId: `inv-${i}`,
						author: "agent",
						content: { parts: [{ text: `m${i}` }] },
						timestamp: 1000 + i * 100,
					}),
				);
			}
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "compact",
					author: "user",
					timestamp: 1450,
					actions: new EventActions({
						compaction: {
							startTimestamp: 1000,
							endTimestamp: 1400,
							compactedContent: {
								role: "model",
								parts: [{ text: "inv-0..inv-4" }],
							},
						},
					}),
				}),
			);
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "inv-5",
					author: "agent",
					content: { parts: [{ text: "m5" }] },
					timestamp: 1500,
				}),
			);
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "inv-6",
					author: "agent",
					content: { parts: [{ text: "m6" }] },
					timestamp: 1600,
				}),
			);

			session = await refreshSession(session);
			await runCompactionForSlidingWindow(
				config,
				session,
				sessionService,
				mockSummarizer,
			);

			expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalledTimes(1);
			const compacted = (mockSummarizer.maybeSummarizeEvents as any).mock
				.calls[0][0] as Event[];
			expect(compacted.map((e) => e.invocationId)).toEqual([
				"inv-3",
				"inv-4",
				"inv-5",
				"inv-6",
			]);
			expect(compacted.map((e) => e.content?.parts?.[0]?.text)).toEqual([
				"m3",
				"m4",
				"m5",
				"m6",
			]);
			expect(compacted.some((e) => e.invocationId === "inv-2")).toBe(false);
			expect(compacted.some((e) => e.actions?.compaction)).toBe(false);
		});

		it("excludes timestamp-0 events from the invocation map (0 never exceeds current)", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 1,
				overlapSize: 0,
			};

			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "zero-ts",
					author: "agent",
					content: { parts: [{ text: "at-zero" }] },
					timestamp: 0,
				}),
			);
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "later",
					author: "agent",
					content: { parts: [{ text: "later" }] },
					timestamp: 10,
				}),
			);

			session = await refreshSession(session);
			await runCompactionForSlidingWindow(
				config,
				session,
				sessionService,
				mockSummarizer,
			);

			expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalledTimes(1);
			const compacted = (mockSummarizer.maybeSummarizeEvents as any).mock
				.calls[0][0] as Event[];
			expect(compacted.map((e) => e.invocationId)).toEqual(["later"]);
			expect(compacted.some((e) => e.invocationId === "zero-ts")).toBe(false);
		});

		it("returns early when sliceEventsByInvocationRange yields no non-compaction events", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 2,
				overlapSize: 0,
			};

			const mapEvents = [
				new Event({
					invocationId: "a",
					author: "agent",
					content: { parts: [{ text: "a" }] },
					timestamp: 100,
				}),
				new Event({
					invocationId: "b",
					author: "agent",
					content: { parts: [{ text: "b" }] },
					timestamp: 200,
				}),
			];
			const emptySliceEvents = [
				new Event({
					invocationId: "a",
					author: "user",
					timestamp: 50,
					actions: new EventActions({
						compaction: {
							startTimestamp: 1,
							endTimestamp: 2,
							compactedContent: {
								role: "model",
								parts: [{ text: "carrier-a" }],
							},
						},
					}),
				}),
				new Event({
					invocationId: "b",
					author: "user",
					timestamp: 60,
					actions: new EventActions({
						compaction: {
							startTimestamp: 1,
							endTimestamp: 2,
							compactedContent: {
								role: "model",
								parts: [{ text: "carrier-b" }],
							},
						},
					}),
				}),
			];

			let reads = 0;
			Object.defineProperty(session, "events", {
				configurable: true,
				get() {
					reads += 1;
					// !events + .length + findLast + buildMap; slice sees only carriers
					return reads <= 4 ? mapEvents : emptySliceEvents;
				},
			});

			await runCompactionForSlidingWindow(
				config,
				session,
				sessionService,
				mockSummarizer,
			);

			expect(mockSummarizer.maybeSummarizeEvents).not.toHaveBeenCalled();
			expect(reads).toBeGreaterThanOrEqual(5);
		});

		it("returns empty when firstIndex > lastIndex via divergent event list for slice", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 2,
				overlapSize: 0,
			};

			const mapEvents = [
				new Event({
					invocationId: "start-id",
					author: "agent",
					content: { parts: [{ text: "start" }] },
					timestamp: 100,
				}),
				new Event({
					invocationId: "end-id",
					author: "agent",
					content: { parts: [{ text: "end" }] },
					timestamp: 200,
				}),
			];
			const invertedEvents = [
				new Event({
					invocationId: "end-id",
					author: "agent",
					content: { parts: [{ text: "end-first" }] },
					timestamp: 50,
				}),
				new Event({
					invocationId: "start-id",
					author: "agent",
					content: { parts: [{ text: "start-second" }] },
					timestamp: 150,
				}),
			];

			let reads = 0;
			Object.defineProperty(session, "events", {
				configurable: true,
				get() {
					reads += 1;
					// !events + .length + findLast + buildMap use ordered mapEvents; slice sees inverted
					return reads <= 4 ? mapEvents : invertedEvents;
				},
			});

			await runCompactionForSlidingWindow(
				config,
				session,
				sessionService,
				mockSummarizer,
			);

			expect(mockSummarizer.maybeSummarizeEvents).not.toHaveBeenCalled();
			expect(reads).toBeGreaterThanOrEqual(5);
		});

		it("propagates summarizer failures without appending", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 2,
				overlapSize: 0,
			};
			mockSummarizer.maybeSummarizeEvents = vi
				.fn()
				.mockRejectedValue(new Error("summarizer boom"));

			for (let i = 0; i < 2; i++) {
				await sessionService.appendEvent(
					session,
					new Event({
						invocationId: `inv-${i}`,
						author: "agent",
						content: { parts: [{ text: `m${i}` }] },
						timestamp: 1000 + i,
					}),
				);
			}
			session = await refreshSession(session);

			await expect(
				runCompactionForSlidingWindow(
					config,
					session,
					sessionService,
					mockSummarizer,
				),
			).rejects.toThrow("summarizer boom");

			session = await refreshSession(session);
			expect(session.events.some((e) => e.actions?.compaction)).toBe(false);
		});

		it("propagates sessionService.appendEvent failures after summarizer success", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 2,
				overlapSize: 0,
			};
			for (let i = 0; i < 2; i++) {
				await sessionService.appendEvent(
					session,
					new Event({
						invocationId: `inv-${i}`,
						author: "agent",
						content: { parts: [{ text: `m${i}` }] },
						timestamp: 2000 + i,
					}),
				);
			}
			session = await refreshSession(session);

			const appendSpy = vi
				.spyOn(sessionService, "appendEvent")
				.mockRejectedValueOnce(new Error("append failed"));

			await expect(
				runCompactionForSlidingWindow(
					config,
					session,
					sessionService,
					mockSummarizer,
				),
			).rejects.toThrow("append failed");

			expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalledTimes(1);
			appendSpy.mockRestore();
		});

		it("skips append when summarizer returns undefined", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 2,
				overlapSize: 0,
			};
			mockSummarizer.maybeSummarizeEvents = vi
				.fn()
				.mockResolvedValue(undefined);

			for (let i = 0; i < 2; i++) {
				await sessionService.appendEvent(
					session,
					new Event({
						invocationId: `inv-${i}`,
						author: "agent",
						content: { parts: [{ text: `m${i}` }] },
						timestamp: 3000 + i,
					}),
				);
			}
			session = await refreshSession(session);
			const beforeCount = session.events.length;

			await runCompactionForSlidingWindow(
				config,
				session,
				sessionService,
				mockSummarizer,
			);

			session = await refreshSession(session);
			expect(session.events).toHaveLength(beforeCount);
			expect(session.events.some((e) => e.actions?.compaction)).toBe(false);
		});

		it.each([
			{ interval: 1, overlap: 0, invocations: 1, expectCall: true },
			{ interval: 1, overlap: 1, invocations: 2, expectCall: true },
			{ interval: 2, overlap: 0, invocations: 1, expectCall: false },
			{ interval: 2, overlap: 0, invocations: 2, expectCall: true },
			{ interval: 2, overlap: 1, invocations: 2, expectCall: true },
			{ interval: 3, overlap: 0, invocations: 2, expectCall: false },
			{ interval: 3, overlap: 0, invocations: 3, expectCall: true },
			{ interval: 3, overlap: 2, invocations: 3, expectCall: true },
			{ interval: 4, overlap: 3, invocations: 4, expectCall: true },
			{ interval: 5, overlap: 0, invocations: 4, expectCall: false },
			{ interval: 5, overlap: 1, invocations: 5, expectCall: true },
			{ interval: 1, overlap: 0, invocations: 3, expectCall: true },
		] as const)("interval=$interval overlap=$overlap with $invocations invocations → call=$expectCall", async ({
			interval,
			overlap,
			invocations,
			expectCall,
		}) => {
			session = await sessionService.createSession(
				"test-app",
				`user-${interval}-${overlap}-${invocations}`,
			);
			const config: EventsCompactionConfig = {
				compactionInterval: interval,
				overlapSize: overlap,
			};

			for (let i = 0; i < invocations; i++) {
				await sessionService.appendEvent(
					session,
					new Event({
						invocationId: `inv-${i}`,
						author: "agent",
						content: { parts: [{ text: `m${i}` }] },
						timestamp: 5000 + i * 10,
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

			if (expectCall) {
				expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalledTimes(1);
				const compacted = (mockSummarizer.maybeSummarizeEvents as any).mock
					.calls[0][0] as Event[];
				expect(compacted.length).toBeGreaterThan(0);
				expect(compacted.every((e) => !e.actions?.compaction)).toBe(true);
			} else {
				expect(mockSummarizer.maybeSummarizeEvents).not.toHaveBeenCalled();
			}
		});

		it("compacts when prior compaction endTimestamp is 0 and later events are strictly newer", async () => {
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
							startTimestamp: 0,
							endTimestamp: 0,
							compactedContent: {
								role: "model",
								parts: [{ text: "prior empty end" }],
							},
						},
					}),
				}),
			);
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "n0",
					author: "agent",
					content: { parts: [{ text: "one" }] },
					timestamp: 1,
				}),
			);
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "n1",
					author: "agent",
					content: { parts: [{ text: "two" }] },
					timestamp: 2,
				}),
			);

			session = await refreshSession(session);
			await runCompactionForSlidingWindow(
				config,
				session,
				sessionService,
				mockSummarizer,
			);

			expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalledTimes(1);
			const compacted = (mockSummarizer.maybeSummarizeEvents as any).mock
				.calls[0][0] as Event[];
			expect(compacted.map((e) => e.invocationId)).toEqual(["n0", "n1"]);
		});

		it("includes overlap invocations that sit before the new window", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 2,
				overlapSize: 3,
			};

			for (let i = 0; i < 6; i++) {
				await sessionService.appendEvent(
					session,
					new Event({
						invocationId: `hist-${i}`,
						author: "agent",
						content: { parts: [{ text: `h${i}` }] },
						timestamp: 100 + i,
					}),
				);
			}
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "c1",
					author: "user",
					timestamp: 150,
					actions: new EventActions({
						compaction: {
							startTimestamp: 100,
							endTimestamp: 103,
							compactedContent: {
								role: "model",
								parts: [{ text: "hist-0..3" }],
							},
						},
					}),
				}),
			);
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "new-a",
					author: "agent",
					content: { parts: [{ text: "na" }] },
					timestamp: 200,
				}),
			);
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "new-b",
					author: "agent",
					content: { parts: [{ text: "nb" }] },
					timestamp: 210,
				}),
			);

			session = await refreshSession(session);
			await runCompactionForSlidingWindow(
				config,
				session,
				sessionService,
				mockSummarizer,
			);

			const compacted = (mockSummarizer.maybeSummarizeEvents as any).mock
				.calls[0][0] as Event[];
			// firstNew=hist-4 (idx 4); overlapSize 3 → startIdx=1 → hist-1..new-b
			expect(compacted.map((e) => e.invocationId)).toEqual([
				"hist-1",
				"hist-2",
				"hist-3",
				"hist-4",
				"hist-5",
				"new-a",
				"new-b",
			]);
		});

		it("falls back to timestamp 0 when invocation map lookup is missing", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 1,
				overlapSize: 0,
			};

			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "inv-missing-ts",
					author: "agent",
					content: { parts: [{ text: "present" }] },
					timestamp: 50,
				}),
			);
			session = await refreshSession(session);

			const originalGet = Map.prototype.get;
			const spy = vi.spyOn(Map.prototype, "get").mockImplementation(function (
				this: Map<unknown, unknown>,
				key,
			) {
				const value = originalGet.call(this, key);
				if (typeof key === "string" && typeof value === "number") {
					return undefined;
				}
				return value;
			});

			try {
				await runCompactionForSlidingWindow(
					config,
					session,
					sessionService,
					mockSummarizer,
				);
			} finally {
				spy.mockRestore();
			}

			// (undefined || 0) > lastCompacted(0) is false, so compaction does not run
			expect(mockSummarizer.maybeSummarizeEvents).not.toHaveBeenCalled();
		});

		it("ignores events without invocationId when building the invocation map", async () => {
			const config: EventsCompactionConfig = {
				compactionInterval: 2,
				overlapSize: 0,
			};

			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "",
					author: "agent",
					content: { parts: [{ text: "no-id" }] },
					timestamp: 10,
				}),
			);
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "keep-0",
					author: "agent",
					content: { parts: [{ text: "k0" }] },
					timestamp: 20,
				}),
			);
			await sessionService.appendEvent(
				session,
				new Event({
					invocationId: "keep-1",
					author: "agent",
					content: { parts: [{ text: "k1" }] },
					timestamp: 30,
				}),
			);

			session = await refreshSession(session);
			await runCompactionForSlidingWindow(
				config,
				session,
				sessionService,
				mockSummarizer,
			);

			const compacted = (mockSummarizer.maybeSummarizeEvents as any).mock
				.calls[0][0] as Event[];
			expect(compacted.map((e) => e.invocationId)).toEqual([
				"keep-0",
				"keep-1",
			]);
			expect(
				compacted.some((e) => e.content?.parts?.[0]?.text === "no-id"),
			).toBe(false);
		});
	});
});
