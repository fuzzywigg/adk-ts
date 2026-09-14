import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCompactionForSlidingWindow } from "../../events/compaction";
import { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";
import type { EventsSummarizer } from "../../events/events-summarizer";
import { InMemorySessionService } from "../../sessions/in-memory-session-service";
import type { Session } from "../../sessions/session";

describe("compaction summarizer-undefined / empty-slice fifth leftover (post #165)", () => {
	let sessionService: InMemorySessionService;
	let session: Session;

	const refresh = async (s: Session) => {
		const refreshed = await sessionService.getSession(
			s.appName,
			s.userId,
			s.id,
		);
		return refreshed!;
	};

	beforeEach(async () => {
		sessionService = new InMemorySessionService();
		session = await sessionService.createSession("app", "user");
	});

	async function appendPlain(invocationId: string, timestamp: number) {
		await sessionService.appendEvent(
			session,
			new Event({
				invocationId,
				author: "agent",
				content: { parts: [{ text: invocationId }] },
				timestamp,
			}),
		);
	}

	it.each([
		{ label: "undefined", value: undefined },
		{ label: "null", value: null },
		{ label: "false", value: false },
		{ label: "0", value: 0 },
		{ label: '""', value: "" },
	] as const)("does not appendEvent when maybeSummarizeEvents returns falsy $label", async ({
		value,
	}) => {
		const summarizer: EventsSummarizer = {
			maybeSummarizeEvents: vi.fn().mockResolvedValue(value as any),
		};
		const appendSpy = vi.spyOn(sessionService, "appendEvent");

		for (let i = 0; i < 3; i++) {
			await appendPlain(`inv-${i}`, 10 + i);
		}
		session = await refresh(session);
		const appendCallsBefore = appendSpy.mock.calls.length;

		await runCompactionForSlidingWindow(
			{ compactionInterval: 2, overlapSize: 0 },
			session,
			sessionService,
			summarizer,
		);

		expect(summarizer.maybeSummarizeEvents).toHaveBeenCalled();
		expect(appendSpy.mock.calls.length).toBe(appendCallsBefore);
	});

	it("appends when summarizer returns a compaction event", async () => {
		const compactionEvent = new Event({
			invocationId: "compaction",
			author: "user",
			actions: new EventActions({
				compaction: {
					startTimestamp: 10,
					endTimestamp: 12,
					compactedContent: {
						role: "model",
						parts: [{ text: "summary" }],
					},
				},
			}),
		});
		const summarizer: EventsSummarizer = {
			maybeSummarizeEvents: vi.fn().mockResolvedValue(compactionEvent),
		};

		for (let i = 0; i < 3; i++) {
			await appendPlain(`ok-${i}`, 20 + i);
		}
		session = await refresh(session);
		await runCompactionForSlidingWindow(
			{ compactionInterval: 2, overlapSize: 0 },
			session,
			sessionService,
			summarizer,
		);
		session = await refresh(session);
		expect(
			session.events.some((e) => e.actions?.compaction !== undefined),
		).toBe(true);
	});

	it("skips events missing invocationId when building latest-timestamp map", async () => {
		const summarizer: EventsSummarizer = {
			maybeSummarizeEvents: vi.fn().mockResolvedValue(undefined),
		};
		await sessionService.appendEvent(
			session,
			new Event({
				invocationId: "",
				author: "agent",
				content: { parts: [{ text: "no-id" }] },
				timestamp: 100,
			}),
		);
		await appendPlain("real-a", 101);
		await appendPlain("real-b", 102);
		session = await refresh(session);

		await runCompactionForSlidingWindow(
			{ compactionInterval: 2, overlapSize: 0 },
			session,
			sessionService,
			summarizer,
		);
		expect(summarizer.maybeSummarizeEvents).toHaveBeenCalled();
		const compacted = (summarizer.maybeSummarizeEvents as any).mock
			.calls[0][0] as Event[];
		expect(compacted.every((e) => e.invocationId)).toBe(true);
		expect(compacted.some((e) => e.content?.parts?.[0]?.text === "no-id")).toBe(
			false,
		);
	});

	it("returns early when session.events is nullish", async () => {
		const summarizer: EventsSummarizer = {
			maybeSummarizeEvents: vi.fn(),
		};
		await runCompactionForSlidingWindow(
			{ compactionInterval: 1, overlapSize: 0 },
			{ ...session, events: null as any },
			sessionService,
			summarizer,
		);
		await runCompactionForSlidingWindow(
			{ compactionInterval: 1, overlapSize: 0 },
			{ ...session, events: undefined as any },
			sessionService,
			summarizer,
		);
		expect(summarizer.maybeSummarizeEvents).not.toHaveBeenCalled();
	});
});
