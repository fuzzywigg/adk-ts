import "reflect-metadata";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { CliModule } from "../../cli/cli.module";
import { NewCommand } from "../../cli/new.command";
import { RunCommand } from "../../cli/run.command";
import { ServeCommand } from "../../cli/serve.command";
import { WebCommand } from "../../cli/web.command";

describe("CLI option parsers", () => {
	it("CliModule registers command providers", () => {
		expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, CliModule)).toEqual([
			ServeCommand,
			NewCommand,
			RunCommand,
			WebCommand,
		]);
	});

	it("ServeCommand parses port/host/dir/quiet/swagger flags", () => {
		const command = new ServeCommand();
		expect(command.parsePort("9000")).toBe(9000);
		expect(command.parseHost("0.0.0.0")).toBe("0.0.0.0");
		expect(command.parseDir("./agents")).toBe("./agents");
		expect(command.parseQuiet()).toBe(true);
		expect(command.parseSwagger()).toBe(true);
		expect(command.parseNoSwagger()).toBe(true);
	});

	it("WebCommand parses port/host/dir/web-url flags", () => {
		const command = new WebCommand();
		expect(command.parsePort("8080")).toBe(8080);
		expect(command.parseHost("127.0.0.1")).toBe("127.0.0.1");
		expect(command.parseDir("/agents")).toBe("/agents");
		expect(command.parseWebUrl("http://localhost:3000")).toBe(
			"http://localhost:3000",
		);
	});

	it("RunCommand parses host/verbose/hot/watch flags", () => {
		const command = new RunCommand();
		expect(command.parseServer()).toBe(true);
		expect(command.parseHost("localhost")).toBe("localhost");
		expect(command.parseVerbose()).toBe(true);
		expect(command.parseHot()).toBe(true);
		expect(command.parseWatch(" src , dist,, ")).toEqual(["src", "dist"]);
		expect(command.parseWatch("")).toEqual([]);
	});
});
