import { afterEach, describe, expect, it, vi } from "vitest";
import { HotReloadService } from "../../../http/reload/hot-reload.service";

function createFakeResponse() {
	const writes: string[] = [];
	const listeners = new Map<string, Array<(...args: any[]) => void>>();
	const res = {
		writes,
		write: vi.fn((chunk: string) => {
			writes.push(chunk);
			return true;
		}),
		end: vi.fn(),
		on: vi.fn((event: string, listener: (...args: any[]) => void) => {
			const list = listeners.get(event) || [];
			list.push(listener);
			listeners.set(event, list);
			return res;
		}),
		emit(event: string) {
			for (const listener of listeners.get(event) || []) {
				listener();
			}
		},
	};
	return res;
}

describe("HotReloadService", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("adds clients with a connected comment and close handler", () => {
		const service = new HotReloadService();
		const res = createFakeResponse();

		service.addClient(res);

		expect(res.write).toHaveBeenCalledWith(": connected\n\n");
		expect(res.on).toHaveBeenCalledWith("close", expect.any(Function));

		service.closeAll();
		expect(res.end).toHaveBeenCalled();
	});

	it("broadcasts reload and state events to all clients", () => {
		vi.useFakeTimers();
		const service = new HotReloadService();
		const a = createFakeResponse();
		const b = createFakeResponse();
		service.addClient(a);
		service.addClient(b);

		service.broadcastReload("agent.ts");
		service.broadcastState("agents/demo", "sess-1");

		const reloadPayload = a.writes.find((w) => w.includes('"type":"reload"'));
		const statePayload = b.writes.find((w) => w.includes('"type":"state"'));

		expect(reloadPayload).toContain('"filename":"agent.ts"');
		expect(statePayload).toContain('"agentPath":"agents/demo"');
		expect(statePayload).toContain('"sessionId":"sess-1"');

		service.closeAll();
	});

	it("removes clients that fail during broadcast", () => {
		const service = new HotReloadService();
		const good = createFakeResponse();
		const bad = createFakeResponse();
		bad.write.mockImplementation((chunk: string) => {
			if (chunk.startsWith("data:")) {
				throw new Error("broken pipe");
			}
			return true;
		});

		service.addClient(good);
		service.addClient(bad);
		service.broadcastReload(null);

		expect(bad.end).toHaveBeenCalled();
		expect(good.writes.some((w) => w.includes('"type":"reload"'))).toBe(true);

		service.closeAll();
	});

	it("sends keepalive pings on an interval", () => {
		vi.useFakeTimers();
		const service = new HotReloadService();
		const res = createFakeResponse();
		service.addClient(res);

		vi.advanceTimersByTime(25000);
		expect(res.writes.some((w) => w.startsWith(": ping "))).toBe(true);

		service.closeAll();
	});

	it("removeClient on close event cleans timers", () => {
		vi.useFakeTimers();
		const service = new HotReloadService();
		const res = createFakeResponse();
		service.addClient(res);
		res.emit("close");
		expect(res.end).toHaveBeenCalled();
		service.closeAll();
	});
});
