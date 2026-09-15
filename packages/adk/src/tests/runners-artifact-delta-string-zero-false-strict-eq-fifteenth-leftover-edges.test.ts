import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { EventActions } from "../events/event-actions";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Fifteenth leftover (HEAVY tip-relaunch residual after tip #269 / 03ff90a8 after providers; supersedes closed #273/#262): fourteenth leftover pins `-0`↔`0` SameValueZero
 * omit and `NaN !== NaN` save. String `"0"` / `"false"` use strict `===` —
 * same string omits; string vs numeric/boolean counterpart saves.
 */
describe("runners artifact-delta string-zero/false strict-eq fifteenth leftover", () => {
	let sessionService: InMemorySessionService;
	let agent: LlmAgent;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
	});

	it.each([
		{ label: "string-zero", value: "0" },
		{ label: "string-false", value: "false" },
	])("omits filename when rewind and current both hold $label", async ({
		value,
		label,
	}) => {
		const saveArtifact = vi.fn().mockResolvedValue(3);
		const runner = new Runner({
			appName: "runner-art15",
			agent,
			sessionService,
			artifactService: { saveArtifact } as any,
		});
		const before = new Event({
			author: "root_agent",
			invocationId: "inv-a",
			actions: new EventActions({
				artifactDelta: { "note.bin": value as any },
			}),
		});
		const after = new Event({
			author: "root_agent",
			invocationId: "inv-b",
			actions: new EventActions({
				artifactDelta: { "note.bin": value as any },
			}),
		});
		const session = {
			id: `s-same-${label}`,
			appName: "runner-art15",
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

	it('includes filename when rewind "0" vs current numeric 0 (strict !==)', async () => {
		const saveArtifact = vi.fn().mockResolvedValue(7);
		const runner = new Runner({
			appName: "runner-art15",
			agent,
			sessionService,
			artifactService: { saveArtifact } as any,
		});
		const before = new Event({
			author: "root_agent",
			invocationId: "inv-a",
			actions: new EventActions({ artifactDelta: { "note.bin": "0" as any } }),
		});
		const after = new Event({
			author: "root_agent",
			invocationId: "inv-b",
			actions: new EventActions({ artifactDelta: { "note.bin": 0 } }),
		});
		const session = {
			id: "s-str-vs-num",
			appName: "runner-art15",
			userId: "u1",
			state: {},
			events: [before, after],
			lastUpdateTime: 0,
		};

		const delta = await (runner as any)._computeArtifactDeltaForRewind(
			session,
			1,
		);
		expect(delta).toEqual({ "note.bin": 7 });
		expect(saveArtifact).toHaveBeenCalledTimes(1);
	});
});
