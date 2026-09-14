import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { EventActions } from "../events/event-actions";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Fourteenth leftover (HEAVY tip-relaunch residual after #243):
 * rewind artifact `vt === vn` SameValueZero sibling of state-delta fourteenth —
 * `-0`↔`0` skip restore; `NaN !== NaN` still attempts saveArtifact.
 */
describe("runners artifact-delta negzero/nan SameValueZero fourteenth leftover", () => {
	let sessionService: InMemorySessionService;
	let agent: LlmAgent;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
	});

	it("omits filename when rewind holds -0 and current holds 0 (SameValueZero)", async () => {
		const saveArtifact = vi.fn().mockResolvedValue(3);
		const runner = new Runner({
			appName: "runner-art14h",
			agent,
			sessionService,
			artifactService: { saveArtifact } as any,
		});
		const before = new Event({
			author: "root_agent",
			invocationId: "inv-a",
			actions: new EventActions({ artifactDelta: { "note.bin": -0 } }),
		});
		const after = new Event({
			author: "root_agent",
			invocationId: "inv-b",
			actions: new EventActions({ artifactDelta: { "note.bin": 0 } }),
		});
		const session = {
			id: "s-negzero",
			appName: "runner-art14h",
			userId: "u1",
			state: {},
			events: [before, after],
			lastUpdateTime: 0,
		};

		const delta = await (runner as any)._computeArtifactDeltaForRewind(
			session,
			1,
		);
		expect(delta).toEqual({});
		expect(saveArtifact).not.toHaveBeenCalled();
	});

	it("includes filename when rewind NaN vs current NaN (NaN !== NaN)", async () => {
		const saveArtifact = vi.fn().mockResolvedValue(9);
		const runner = new Runner({
			appName: "runner-art14h",
			agent,
			sessionService,
			artifactService: { saveArtifact } as any,
		});
		const before = new Event({
			author: "root_agent",
			invocationId: "inv-a",
			actions: new EventActions({
				artifactDelta: { "note.bin": Number.NaN },
			}),
		});
		const after = new Event({
			author: "root_agent",
			invocationId: "inv-b",
			actions: new EventActions({
				artifactDelta: { "note.bin": Number.NaN },
			}),
		});
		const session = {
			id: "s-nan",
			appName: "runner-art14h",
			userId: "u1",
			state: {},
			events: [before, after],
			lastUpdateTime: 0,
		};

		const delta = await (runner as any)._computeArtifactDeltaForRewind(
			session,
			1,
		);
		expect(delta).toEqual({ "note.bin": 9 });
		expect(saveArtifact).toHaveBeenCalledTimes(1);
	});
});
