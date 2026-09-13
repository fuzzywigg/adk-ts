import { describe, expect, it } from "vitest";
import {
	BaseLLMConnection,
	type Blob,
	type Content,
} from "../../models/base-llm-connection";
import { LlmResponse } from "../../models/llm-response";

class StubConnection extends BaseLLMConnection {
	history: Content[][] = [];
	contents: Content[] = [];
	blobs: Blob[] = [];
	closed = false;

	async sendHistory(history: Content[]): Promise<void> {
		this.history.push(history);
	}

	async sendContent(content: Content): Promise<void> {
		this.contents.push(content);
	}

	async sendRealtime(blob: Blob): Promise<void> {
		this.blobs.push(blob);
	}

	async *receive(): AsyncGenerator<LlmResponse, void, unknown> {
		yield new LlmResponse({
			content: { role: "model", parts: [{ text: "pong" }] },
		});
	}

	async close(): Promise<void> {
		this.closed = true;
	}
}

describe("BaseLLMConnection stub subclass", () => {
	it("records history, content, realtime blobs, and close", async () => {
		const connection = new StubConnection();
		const history: Content[] = [{ role: "user", parts: [{ text: "hi" }] }];
		const content: Content = {
			role: "user",
			parts: [{ text: "next" }],
		};
		const blob = { mimeType: "audio/pcm", data: "AA==" } as Blob;

		await connection.sendHistory(history);
		await connection.sendContent(content);
		await connection.sendRealtime(blob);

		const responses: LlmResponse[] = [];
		for await (const response of connection.receive()) {
			responses.push(response);
		}
		await connection.close();

		expect(connection.history).toEqual([history]);
		expect(connection.contents).toEqual([content]);
		expect(connection.blobs).toEqual([blob]);
		expect(responses).toHaveLength(1);
		expect(responses[0].content?.parts?.[0]?.text).toBe("pong");
		expect(connection.closed).toBe(true);
	});
});
