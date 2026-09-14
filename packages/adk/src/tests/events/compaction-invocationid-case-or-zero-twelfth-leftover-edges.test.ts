import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCompactionForSlidingWindow } from "../../../events/compaction.js";
import type { EventsCompactionConfig } from "../../../events/compaction-config.js";
import { Event } from "../../../events/event.js";
import { EventActions } from "../../../events/event-actions.js";
import type { EventsSummarizer } from "../../../events/events-summarizer.js";
import { InMemorySessionService } from "../../../sessions/in-memory-session-service.js";
import type { Session } from "../../../sessions/session.js";

describe("compaction invocationId === case + timestamp 0 twelfth leftover", () => {
	let sessionService: InMemorySessionService;
	let mockSummarizer: EventsSummarizer;
	let session: Session;

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

	it("case-distinct Inv-a vs inv-a are two Map keys so interval 2 fires", async () => {
		const config: EventsCompactionConfig = {
			compactionInterval: 2,
			overlapSize: 0,
		};

		await sessionService.appendEvent(
			session,
			new Event({
				invocationId: "inv-a",
				author: "user",
				timestamp: 10,
				content: { parts: [{ text: "lower" }] },
			}),
		);
		await sessionService.appendEvent(
			session,
			new Event({
				invocationId: "Inv-a",
				author: "user",
				timestamp: 11,
				content: { parts: [{ text: "cased" }] },
			}),
		);

		await runCompactionForSlidingWindow(
			config,
			session,
			sessionService,
			mockSummarizer,
		);

		expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalledTimes(1);
	});

	it("same-cased duplicate invocation does not satisfy interval 2", async () => {
		const config: EventsCompactionConfig = {
			compactionInterval: 2,
			overlapSize: 0,
		};

		await sessionService.appendEvent(
			session,
			new Event({
				invocationId: "inv-a",
				author: "user",
				timestamp: 10,
				content: { parts: [{ text: "a1" }] },
			}),
		);
		await sessionService.appendEvent(
			session,
			new Event({
				invocationId: "inv-a",
				author: "user",
				timestamp: 11,
				content: { parts: [{ text: "a2" }] },
			}),
		);

		await runCompactionForSlidingWindow(
			config,
			session,
			sessionService,
			mockSummarizer,
		);

		expect(mockSummarizer.maybeSummarizeEvents).not.toHaveBeenCalled();
	});

	it("timestamp 0 never enters the map (0 > current 0 is false) so interval 1 does not fire", async () => {
		const config: EventsCompactionConfig = {
			compactionInterval: 1,
			overlapSize: 0,
		};

		await sessionService.appendEvent(
			session,
			new Event({
				invocationId: "zero-ts",
				author: "user",
				timestamp: 0,
				content: { parts: [{ text: "zero" }] },
			}),
		);

		await runCompactionForSlidingWindow(
			config,
			session,
			sessionService,
			mockSummarizer,
		);

		expect(mockSummarizer.maybeSummarizeEvents).not.toHaveBeenCalled();
	});

	it("timestamp 1 is stored so interval 1 fires", async () => {
		const config: EventsCompactionConfig = {
			compactionInterval: 1,
			overlapSize: 0,
		};

		await sessionService.appendEvent(
			session,
			new Event({
				invocationId: "one-ts",
				author: "user",
				timestamp: 1,
				content: { parts: [{ text: "one" }] },
			}),
		);

		await runCompactionForSlidingWindow(
			config,
			session,
			sessionService,
			mockSummarizer,
		);

		expect(mockSummarizer.maybeSummarizeEvents).toHaveBeenCalledTimes(1);
	});
});
