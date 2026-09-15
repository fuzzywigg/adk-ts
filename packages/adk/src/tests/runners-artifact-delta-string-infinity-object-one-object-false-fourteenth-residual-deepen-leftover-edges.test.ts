import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { EventActions } from "../events/event-actions";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Fourteenth leftover residual deepen (complements #254 SameValueZero/-0/NaN):
 * rewind artifact `vt === vn` — shared string `"Infinity"` omits; distinct
 * `Object(1)` / `Object(false)` refs are `!==` so save still runs.
 */
describe("runners artifact-delta string-infinity/object-one/object-false fourteenth residual deepen", () => {
	let sessionService: InMemorySessionService;
	let agent: LlmAgent;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
	});

	it('omits filename when rewind and current share string "Infinity"', async () => {
		const saveArtifact = vi.fn().mockResolvedValue(3);
		const runner = new Runner({
			appName: "runner-art14rd",
			agent,
			sessionService,
			artifactService: { saveArtifact } as any,
		});
		const before = new Event({
			author: "root_agent",
			invocationId: "inv-a",
			actions: new EventActions({
				artifactDelta: { "note.bin": "Infinity" as any },
			}),
		});
		const after = new Event({
			author: "root_agent",
			invocationId: "inv-b",
			actions: new EventActions({
				artifactDelta: { "note.bin": "Infinity" as any },
			}),
		});
		const session = {
			id: "s-str-inf",
			appName: "runner-art14rd",
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

	it.each([
		{ label: "Object(1)", make: () => Object(1) },
		{ label: "Object(false)", make: () => Object(false) },
	])("includes filename when rewind/current use distinct $label refs", async ({
		label,
		make,
	}) => {
		const saveArtifact = vi.fn().mockResolvedValue(9);
		const runner = new Runner({
			appName: "runner-art14rd",
			agent,
			sessionService,
			artifactService: { saveArtifact } as any,
		});
		const before = new Event({
			author: "root_agent",
			invocationId: "inv-a",
			actions: new EventActions({
				artifactDelta: { "note.bin": make() as any },
			}),
		});
		const after = new Event({
			author: "root_agent",
			invocationId: "inv-b",
			actions: new EventActions({
				artifactDelta: { "note.bin": make() as any },
			}),
		});
		const session = {
			id: `s-${label}`,
			appName: "runner-art14rd",
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
