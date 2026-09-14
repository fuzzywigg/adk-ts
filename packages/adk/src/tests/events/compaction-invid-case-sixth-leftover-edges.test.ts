import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCompactionForSlidingWindow } from "../../events/compaction";
import { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";
import type { EventsSummarizer } from "../../events/events-summarizer";
import { InMemorySessionService } from "../../sessions/in-memory-session-service";
import type { Session } from "../../sessions/session";

describe("compaction unique invocationId case-sensitivity sixth leftover", () => {
	let sessionService: InMemorySessionService;
	let mockSummarizer: EventsSummarizer;
	let session: Session;

	const refresh = async (s: Session): Promise<Session> => {
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

	it("Inv-A and inv-a count as two distinct invocations so interval 2 compact", async () => {
		await sessionService.appendEvent(
			session,
			new Event({
				invocationId: "Inv-A",
				author: "agent",
				content: { parts: [{ text: "A" }] },
				timestamp: 10,
			}),
		);
		await sessionService.appendEvent(
			session,
			new Event({
				invocationId: "inv-a",
				author: "agent",
				content: { parts: [{ text: "a" }] },
				timestamp: 20,
			}),
		);
		session = await refresh(session);
		await runCompactionForSlidingWindow(
			{ compactionInterval: 2, overlapSize: 0 },
			session,
			sessionService,
			mockSummarizer,
		);
		expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalledTimes(1);
	});

	it("two events sharing the same cased id count as one invocation so interval 2 skips", async () => {
		await sessionService.appendEvent(
			session,
			new Event({
				invocationId: "inv-a",
				author: "agent",
				content: { parts: [{ text: "first" }] },
				timestamp: 10,
			}),
		);
		await sessionService.appendEvent(
			session,
			new Event({
				invocationId: "inv-a",
				author: "agent",
				content: { parts: [{ text: "second" }] },
				timestamp: 20,
			}),
		);
		session = await refresh(session);
		await runCompactionForSlidingWindow(
			{ compactionInterval: 2, overlapSize: 0 },
			session,
			sessionService,
			mockSummarizer,
		);
		expect(mockSummarizer.maybeSummarizeEvents).not.toHaveBeenCalled();
	});
});
