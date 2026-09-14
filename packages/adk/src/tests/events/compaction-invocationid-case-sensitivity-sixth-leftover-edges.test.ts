import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCompactionForSlidingWindow } from "../../events/compaction";
import { Event } from "../../events/event";
import type { EventsSummarizer } from "../../events/events-summarizer";
import { InMemorySessionService } from "../../sessions/in-memory-session-service";
import type { Session } from "../../sessions/session";

/**
 * Sixth leftover: sliceEventsByInvocationRange and the invocation map use
 * `===` / Map keys — `inv-a` and `INV-A` are distinct invocations.
 */
describe("compaction invocationId case-sensitivity sixth leftover edges", () => {
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

	it("treats inv-a and INV-A as two unique invocations via === Map keys", async () => {
		const summarizer: EventsSummarizer = {
			maybeSummarizeEvents: vi.fn().mockResolvedValue(undefined),
		};
		await appendPlain("inv-a", 10);
		await appendPlain("INV-A", 11);
		session = await refresh(session);

		await runCompactionForSlidingWindow(
			{ compactionInterval: 2, overlapSize: 0 },
			session,
			sessionService,
			summarizer,
		);

		expect(summarizer.maybeSummarizeEvents).toHaveBeenCalledTimes(1);
		const compacted = (summarizer.maybeSummarizeEvents as any).mock
			.calls[0][0] as Event[];
		expect(compacted.map((e) => e.invocationId)).toEqual(["inv-a", "INV-A"]);
	});

	it("does not compact a second identically-cased invocation when interval is 2", async () => {
		const summarizer: EventsSummarizer = {
			maybeSummarizeEvents: vi.fn().mockResolvedValue(undefined),
		};
		await appendPlain("inv-a", 10);
		await appendPlain("inv-a", 11);
		session = await refresh(session);

		await runCompactionForSlidingWindow(
			{ compactionInterval: 2, overlapSize: 0 },
			session,
			sessionService,
			summarizer,
		);

		expect(summarizer.maybeSummarizeEvents).not.toHaveBeenCalled();
	});
});
