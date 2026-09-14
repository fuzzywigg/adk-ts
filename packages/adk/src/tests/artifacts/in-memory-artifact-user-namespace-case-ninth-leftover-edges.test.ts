import { describe, expect, it } from "vitest";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

describe("InMemoryArtifactService USER: case near-miss ninth leftover", () => {
	it.each([
		{
			filename: "USER:x.txt",
			path: "app/uid/s1/USER:x.txt",
			label: "uppercase USER:",
		},
		{
			filename: "User:x.txt",
			path: "app/uid/s1/User:x.txt",
			label: "mixed User:",
		},
		{
			filename: "user:x.txt",
			path: "app/uid/user/user:x.txt",
			label: "lowercase user:",
		},
	])("fileHasUserNamespace $label stores under $path", async ({
		filename,
		path,
	}) => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			appName: "app",
			userId: "uid",
			sessionId: "s1",
			filename,
			artifact: { text: "body" },
		});
		expect((service as any).artifacts.has(path)).toBe(true);
	});

	it("USER: artifact is listed under session prefix, not user namespace", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			appName: "app",
			userId: "uid",
			sessionId: "s1",
			filename: "USER:secret.txt",
			artifact: { text: "s" },
		});
		const keys = await service.listArtifactKeys({
			appName: "app",
			userId: "uid",
			sessionId: "s1",
		});
		expect(keys).toEqual(["USER:secret.txt"]);
	});

	it("load with sessionId ignores USER: session-scoped artifact when looking up as user: namespace", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			appName: "app",
			userId: "uid",
			sessionId: "s1",
			filename: "USER:secret.txt",
			artifact: { text: "s" },
		});
		await expect(
			service.loadArtifact({
				appName: "app",
				userId: "uid",
				sessionId: "s1",
				filename: "user:secret.txt",
			}),
		).resolves.toBeNull();
	});
});
