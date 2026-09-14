import { describe, expect, it } from "vitest";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

/**
 * Leftover: when sessionId === "user", sessionPrefix === userNamespacePrefix
 * (`app/uid/user/`). Session-scoped saves land in the user/ path space, so they
 * appear in listArtifactKeys for every session (user-namespace arm). if/else if
 * prevents double-push for a single path, but namespaces are conflated.
 */
describe("InMemoryArtifactService sixth leftover: sessionId=user namespace conflation", () => {
	const base = { appName: "app", userId: "uid" };

	it("session-scoped save with sessionId=user lands under user/ path", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			sessionId: "user",
			filename: "notes.txt",
			artifact: { text: "body" },
		});
		const paths = [...(service as any).artifacts.keys()] as string[];
		expect(paths).toEqual(["app/uid/user/notes.txt"]);
	});

	it("sessionId=user artifact is listed from a different session via user/ arm", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			sessionId: "user",
			filename: "leaked.txt",
			artifact: { text: "leak" },
		});
		const keysOther = await service.listArtifactKeys({
			...base,
			sessionId: "other-sess",
		});
		expect(keysOther).toContain("leaked.txt");
	});

	it("if/else if does not duplicate when sessionId is user", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			sessionId: "user",
			filename: "once.txt",
			artifact: { text: "x" },
		});
		const keys = await service.listArtifactKeys({
			...base,
			sessionId: "user",
		});
		expect(keys.filter((k) => k === "once.txt")).toHaveLength(1);
	});

	it("true user: file and sessionId=user session file share path prefix", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			sessionId: "user",
			filename: "sess.txt",
			artifact: { text: "s" },
		});
		await service.saveArtifact({
			...base,
			sessionId: "ignored",
			filename: "user:ns.txt",
			artifact: { text: "u" },
		});
		const paths = [...(service as any).artifacts.keys()] as string[];
		expect(paths.sort()).toEqual([
			"app/uid/user/sess.txt",
			"app/uid/user/user:ns.txt",
		]);
		const keys = await service.listArtifactKeys({
			...base,
			sessionId: "any-session",
		});
		expect(keys.sort()).toEqual(["sess.txt", "user:ns.txt"]);
	});

	it("sessionId user-extra does not leak into user/ namespace", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			sessionId: "user-extra",
			filename: "a.txt",
			artifact: { text: "a" },
		});
		const keysOther = await service.listArtifactKeys({
			...base,
			sessionId: "other",
		});
		expect(keysOther).not.toContain("a.txt");
		const keysOwn = await service.listArtifactKeys({
			...base,
			sessionId: "user-extra",
		});
		expect(keysOwn).toEqual(["a.txt"]);
	});

	it("load from other session cannot read sessionId=user session file by name alone", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			sessionId: "user",
			filename: "hidden.txt",
			artifact: { text: "h" },
		});
		// load uses getArtifactPath with caller sessionId — other session misses
		await expect(
			service.loadArtifact({
				...base,
				sessionId: "other",
				filename: "hidden.txt",
			}),
		).resolves.toBeNull();
		// but list still shows it via user/ arm
		await expect(
			service.listArtifactKeys({ ...base, sessionId: "other" }),
		).resolves.toContain("hidden.txt");
	});

	it("delete with sessionId=user removes leaked list entry for other sessions", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			sessionId: "user",
			filename: "gone.txt",
			artifact: { text: "x" },
		});
		await service.deleteArtifact({
			...base,
			sessionId: "user",
			filename: "gone.txt",
		});
		await expect(
			service.listArtifactKeys({ ...base, sessionId: "other" }),
		).resolves.toEqual([]);
	});
});
