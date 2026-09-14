import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { ReadonlyContext } from "../../agents/readonly-context";
import { injectSessionState } from "../../utils/instructions-utils";

describe("injectSessionState", () => {
	let mockContext: InvocationContext;
	let readonlyContext: ReadonlyContext;

	beforeEach(() => {
		mockContext = {
			session: {
				id: "test-session",
				appName: "test-app",
				userId: "test-user",
				state: {},
			},
			artifactService: null,
		} as any;
		readonlyContext = new ReadonlyContext(mockContext);
	});

	describe("primitive state variables", () => {
		it("should inject string state variables", async () => {
			mockContext.session.state = { userName: "Alice" };
			const result = await injectSessionState(
				"Hello {userName}!",
				readonlyContext,
			);
			expect(result).toBe("Hello Alice!");
		});

		it("should inject number state variables", async () => {
			mockContext.session.state = { count: 42 };
			const result = await injectSessionState(
				"Count is {count}",
				readonlyContext,
			);
			expect(result).toBe("Count is 42");
		});

		it("should inject boolean state variables", async () => {
			mockContext.session.state = { isActive: true };
			const result = await injectSessionState(
				"Active: {isActive}",
				readonlyContext,
			);
			expect(result).toBe("Active: true");
		});
	});

	describe("object state variables", () => {
		it("should inject object state variables as formatted JSON", async () => {
			mockContext.session.state = {
				user: { name: "Alice", age: 30 },
			};
			const result = await injectSessionState(
				"User data: {user}",
				readonlyContext,
			);
			expect(result).toBe('User data: {\n  "name": "Alice",\n  "age": 30\n}');
		});

		it("should inject array state variables as formatted JSON", async () => {
			mockContext.session.state = {
				items: ["apple", "banana", "cherry"],
			};
			const result = await injectSessionState(
				"Items: {items}",
				readonlyContext,
			);
			expect(result).toBe('Items: [\n  "apple",\n  "banana",\n  "cherry"\n]');
		});

		it("should inject complex nested object as formatted JSON", async () => {
			mockContext.session.state = {
				basket: {
					fruits: [
						{ name: "apple", color: "red" },
						{ name: "banana", color: "yellow" },
					],
				},
			};
			const result = await injectSessionState(
				"Basket: {basket}",
				readonlyContext,
			);
			expect(result).toContain('"fruits"');
			expect(result).toContain('"name": "apple"');
			expect(result).toContain('"color": "red"');
		});
	});

	describe("nested property access", () => {
		beforeEach(() => {
			mockContext.session.state = {
				basket: {
					fruits: [
						{ name: "apple", color: "red" },
						{ name: "banana", color: "yellow" },
					],
					count: 2,
				},
				user: {
					profile: {
						firstName: "John",
						lastName: "Doe",
					},
				},
			};
		});

		it("should access nested object properties", async () => {
			const result = await injectSessionState(
				"First name: {user.profile.firstName}",
				readonlyContext,
			);
			expect(result).toBe("First name: John");
		});

		it("should access array elements by index", async () => {
			const result = await injectSessionState(
				"First fruit: {basket.fruits[0].name}",
				readonlyContext,
			);
			expect(result).toBe("First fruit: apple");
		});

		it("should access nested array properties", async () => {
			const result = await injectSessionState(
				"Color: {basket.fruits[1].color}",
				readonlyContext,
			);
			expect(result).toBe("Color: yellow");
		});

		it("should access simple nested property", async () => {
			const result = await injectSessionState(
				"Count: {basket.count}",
				readonlyContext,
			);
			expect(result).toBe("Count: 2");
		});

		it("should handle multiple nested properties in one template", async () => {
			const result = await injectSessionState(
				"{user.profile.firstName} likes {basket.fruits[0].name}",
				readonlyContext,
			);
			expect(result).toBe("John likes apple");
		});
	});

	describe("optional variables", () => {
		it("should return empty string for missing optional variables", async () => {
			mockContext.session.state = {};
			const result = await injectSessionState(
				"Hello {userName?}!",
				readonlyContext,
			);
			expect(result).toBe("Hello !");
		});

		it("should throw error for missing required variables", async () => {
			mockContext.session.state = {};
			await expect(
				injectSessionState("Hello {userName}!", readonlyContext),
			).rejects.toThrow("Context variable not found: `userName`.");
		});
	});

	describe("artifact variables", () => {
		it("injects artifact contents when the artifact service is available", async () => {
			mockContext.artifactService = {
				loadArtifact: vi.fn().mockResolvedValue("artifact-body"),
			} as any;

			const result = await injectSessionState(
				"Data: {artifact.report}",
				readonlyContext,
			);

			expect(result).toBe("Data: artifact-body");
			expect(mockContext.artifactService.loadArtifact).toHaveBeenCalledWith({
				appName: "test-app",
				userId: "test-user",
				sessionId: "test-session",
				filename: "report",
			});
		});

		it("throws when artifact service is missing for required artifact vars", async () => {
			mockContext.artifactService = null;
			await expect(
				injectSessionState("Data: {artifact.report}", readonlyContext),
			).rejects.toThrow("Artifact service is not initialized.");
		});

		it("returns empty string for optional missing artifacts", async () => {
			mockContext.artifactService = {
				loadArtifact: vi.fn().mockResolvedValue(undefined),
			} as any;

			const result = await injectSessionState(
				"Data: {artifact.missing?}",
				readonlyContext,
			);
			expect(result).toBe("Data: ");
		});

		it("supports prefixed state names like user: and app:", async () => {
			mockContext.session.state = {
				"user:name": "Pat",
				"app:mode": "prod",
			};
			const result = await injectSessionState(
				"{user:name} @ {app:mode}",
				readonlyContext,
			);
			expect(result).toBe("Pat @ prod");
		});
	});

	describe("multiple variables", () => {
		it("should inject multiple variables in one template", async () => {
			mockContext.session.state = {
				firstName: "Alice",
				lastName: "Smith",
				age: 25,
			};
			const result = await injectSessionState(
				"Name: {firstName} {lastName}, Age: {age}",
				readonlyContext,
			);
			expect(result).toBe("Name: Alice Smith, Age: 25");
		});
	});

	describe("edge cases", () => {
		it("should handle null values", async () => {
			mockContext.session.state = { value: null };
			const result = await injectSessionState(
				"Value: {value}",
				readonlyContext,
			);
			expect(result).toBe("Value: null");
		});

		it("should throw error for undefined values", async () => {
			mockContext.session.state = { value: undefined };
			await expect(
				injectSessionState("Value: {value}", readonlyContext),
			).rejects.toThrow("Context variable not found: `value`.");
		});

		it("should not replace invalid variable names", async () => {
			mockContext.session.state = { validName: "test" };
			const result = await injectSessionState(
				"Test {invalid-name} {validName}",
				readonlyContext,
			);
			expect(result).toBe("Test {invalid-name} test");
		});

		it("should validate root property for nested access", async () => {
			mockContext.session.state = { validName: { nested: "value" } };
			const result = await injectSessionState(
				"Test {invalid-name.nested} {validName.nested}",
				readonlyContext,
			);
			// invalid-name should not be replaced because root is invalid
			expect(result).toBe("Test {invalid-name.nested} value");
		});

		it("should handle quoted property names in bracket notation", async () => {
			mockContext.session.state = {
				obj: {
					"key-name": "value1",
					"another.key": "value2",
				},
			};
			const result1 = await injectSessionState(
				"Value: {obj['key-name']}",
				readonlyContext,
			);
			expect(result1).toBe("Value: value1");

			const result2 = await injectSessionState(
				'Value: {obj["another.key"]}',
				readonlyContext,
			);
			expect(result2).toBe("Value: value2");
		});
	});

	describe("error handling", () => {
		it("should throw error when root property doesn't exist", async () => {
			mockContext.session.state = { existingProp: "value" };
			await expect(
				injectSessionState("Test {nonExistentProp}", readonlyContext),
			).rejects.toThrow("Context variable not found: `nonExistentProp`.");
		});

		it("should throw error when nested property path doesn't exist", async () => {
			mockContext.session.state = {
				user: { profile: { name: "John" } },
			};
			await expect(
				injectSessionState("Test {user.profile.age}", readonlyContext),
			).rejects.toThrow("Context variable not found: `user.profile.age`.");
		});

		it("should throw error when intermediate object is null/undefined", async () => {
			mockContext.session.state = {
				user: null,
			};
			await expect(
				injectSessionState("Test {user.name}", readonlyContext),
			).rejects.toThrow("Context variable not found: `user.name`.");
		});

		it("should throw error when array index is out of bounds", async () => {
			mockContext.session.state = {
				items: ["apple", "banana"],
			};
			await expect(
				injectSessionState("Test {items[5]}", readonlyContext),
			).rejects.toThrow("Context variable not found: `items[5]`.");
		});

		it("should throw error on first unresolved variable", async () => {
			mockContext.session.state = {
				validVar: "resolved",
			};
			await expect(
				injectSessionState(
					"Valid: {validVar}, Missing: {missingVar}",
					readonlyContext,
				),
			).rejects.toThrow("Context variable not found: `missingVar`.");
		});

		it("should throw error for complex nested expressions that don't exist", async () => {
			mockContext.session.state = {
				basket: {
					fruits: [{ name: "apple" }],
				},
			};
			await expect(
				injectSessionState("Missing: {basket.fruits[1].name}", readonlyContext),
			).rejects.toThrow("Context variable not found: `basket.fruits[1].name`.");
		});
	});

	describe("placeholder whitespace and empty forms", () => {
		it("trims whitespace inside braces before resolving", async () => {
			mockContext.session.state = { userName: "Ada" };
			const result = await injectSessionState(
				"Hi {  userName  }!",
				readonlyContext,
			);
			expect(result).toBe("Hi Ada!");
		});

		it("leaves empty and near-empty placeholders unchanged when invalid", async () => {
			const result = await injectSessionState(
				"A{}B{?}C{   }D",
				readonlyContext,
			);
			expect(result).toBe("A{}B{?}C{   }D");
		});

		it("treats optional marker with only whitespace as invalid and leaves literal", async () => {
			const result = await injectSessionState("X{  ?}Y", readonlyContext);
			expect(result).toBe("X{  ?}Y");
		});
	});

	describe("prefixed state names", () => {
		it("injects temp: prefixed state", async () => {
			mockContext.session.state = { "temp:scratch": "ephemeral" };
			const result = await injectSessionState(
				"Scratch={temp:scratch}",
				readonlyContext,
			);
			expect(result).toBe("Scratch=ephemeral");
		});

		it("injects all valid prefixes together", async () => {
			mockContext.session.state = {
				"app:env": "staging",
				"user:id": "u-9",
				"temp:nonce": "n-1",
			};
			const result = await injectSessionState(
				"{app:env}/{user:id}/{temp:nonce}",
				readonlyContext,
			);
			expect(result).toBe("staging/u-9/n-1");
		});

		it("leaves unknown prefixes and multi-colon names as literals", async () => {
			mockContext.session.state = { "user:name": "ok" };
			const result = await injectSessionState(
				"{foo:bar} {a:b:c} {user:name}",
				readonlyContext,
			);
			expect(result).toBe("{foo:bar} {a:b:c} ok");
		});

		it("rejects prefixed names with invalid identifiers", async () => {
			const result = await injectSessionState(
				"{user:1bad} {app:bad-name} {temp:}",
				readonlyContext,
			);
			expect(result).toBe("{user:1bad} {app:bad-name} {temp:}");
		});
	});

	describe("identifier validation edges", () => {
		it("accepts $ and _ identifier roots", async () => {
			mockContext.session.state = { $foo: "dollar", _bar: "under" };
			const result = await injectSessionState("{$foo} {_bar}", readonlyContext);
			expect(result).toBe("dollar under");
		});

		it("leaves leading-digit and hyphenated roots as literals", async () => {
			mockContext.session.state = { valid: "yes" };
			const result = await injectSessionState(
				"{1bad} {bad-name} {valid}",
				readonlyContext,
			);
			expect(result).toBe("{1bad} {bad-name} yes");
		});

		it("leaves empty root nested access as literal", async () => {
			const result = await injectSessionState("X{.nested}Y", readonlyContext);
			expect(result).toBe("X{.nested}Y");
		});
	});

	describe("falsy but present values", () => {
		it("formats false, 0, and empty string via String()", async () => {
			mockContext.session.state = {
				flag: false,
				count: 0,
				label: "",
			};
			const result = await injectSessionState(
				"[{flag}|{count}|{label}]",
				readonlyContext,
			);
			expect(result).toBe("[false|0|]");
		});

		it("formats null explicitly and pretty-prints empty objects/arrays", async () => {
			mockContext.session.state = {
				n: null,
				obj: {},
				arr: [],
			};
			const result = await injectSessionState(
				"{n}|{obj}|{arr}",
				readonlyContext,
			);
			expect(result).toBe("null|{}|[]");
		});
	});

	describe("optional nested and intermediate paths", () => {
		it("returns empty for optional nested miss", async () => {
			mockContext.session.state = { user: { profile: {} } };
			const result = await injectSessionState(
				"Age={user.profile.age?}",
				readonlyContext,
			);
			expect(result).toBe("Age=");
		});

		it("returns empty when optional path walks through null", async () => {
			mockContext.session.state = { user: null };
			const result = await injectSessionState(
				"Name={user.name?}",
				readonlyContext,
			);
			expect(result).toBe("Name=");
		});

		it("returns empty for optional missing root", async () => {
			mockContext.session.state = {};
			const result = await injectSessionState("Hi {ghost?}", readonlyContext);
			expect(result).toBe("Hi ");
		});
	});

	describe("artifact variables — deepened", () => {
		it("throws Artifact not found for required missing artifact", async () => {
			mockContext.artifactService = {
				loadArtifact: vi.fn().mockResolvedValue(undefined),
			} as any;

			await expect(
				injectSessionState("Data: {artifact.report}", readonlyContext),
			).rejects.toThrow("Artifact report not found.");
		});

		it("rethrows loadArtifact errors for required artifacts", async () => {
			mockContext.artifactService = {
				loadArtifact: vi.fn().mockRejectedValue(new Error("gcs offline")),
			} as any;

			await expect(
				injectSessionState("Data: {artifact.report}", readonlyContext),
			).rejects.toThrow("gcs offline");
		});

		it("swallows loadArtifact errors for optional artifacts", async () => {
			mockContext.artifactService = {
				loadArtifact: vi.fn().mockRejectedValue(new Error("gcs offline")),
			} as any;

			const result = await injectSessionState(
				"Data: {artifact.report?}",
				readonlyContext,
			);
			expect(result).toBe("Data: ");
		});

		it("still throws when artifact service is null even for optional vars", async () => {
			mockContext.artifactService = null;
			await expect(
				injectSessionState("Data: {artifact.report?}", readonlyContext),
			).rejects.toThrow("Artifact service is not initialized.");
		});

		it("stringifies non-string artifact payloads", async () => {
			mockContext.artifactService = {
				loadArtifact: vi.fn().mockResolvedValue({ kind: "blob", size: 3 }),
			} as any;

			const result = await injectSessionState(
				"Art={artifact.meta}",
				readonlyContext,
			);
			expect(result).toBe("Art=[object Object]");
		});

		it("injects mixed artifact and state placeholders", async () => {
			mockContext.session.state = { userName: "Sam" };
			mockContext.artifactService = {
				loadArtifact: vi
					.fn()
					.mockResolvedValueOnce("body-a")
					.mockResolvedValueOnce("body-b"),
			} as any;

			const result = await injectSessionState(
				"{userName}:{artifact.a}:{artifact.b}",
				readonlyContext,
			);
			expect(result).toBe("Sam:body-a:body-b");
			expect(mockContext.artifactService.loadArtifact).toHaveBeenCalledTimes(2);
		});

		it("fails after earlier successes when a later required artifact is missing", async () => {
			mockContext.session.state = { ok: "yes" };
			mockContext.artifactService = {
				loadArtifact: vi.fn().mockResolvedValue(undefined),
			} as any;

			await expect(
				injectSessionState("{ok} then {artifact.missing}", readonlyContext),
			).rejects.toThrow("Artifact missing not found.");
		});
	});

	describe("nested path parser edges", () => {
		beforeEach(() => {
			mockContext.session.state = {
				matrix: [
					[1, 2],
					[3, 4],
				],
				obj: {
					key: "bare",
					"dot.key": "quoted-dot",
					inner: { "mix'ed": "ok" },
				},
				items: ["zero", "one"],
				map: { "0": "string-zero" },
			};
		});

		it("resolves consecutive bracket indices", async () => {
			const result = await injectSessionState(
				"Cell={matrix[1][0]}",
				readonlyContext,
			);
			expect(result).toBe("Cell=3");
		});

		it("resolves bare unquoted bracket keys", async () => {
			const result = await injectSessionState("V={obj[key]}", readonlyContext);
			expect(result).toBe("V=bare");
		});

		it("treats unclosed brackets as continuing the key accumulation", async () => {
			const result = await injectSessionState("{obj[key}", readonlyContext);
			expect(result).toBe("bare");
		});

		it("trailing dots after a valid root resolve to the root value", async () => {
			const result = await injectSessionState("{obj.}", readonlyContext);
			expect(result).toContain('"key": "bare"');
		});

		it("empty brackets leave the prior segment as the resolved path", async () => {
			const result = await injectSessionState("{obj[]}", readonlyContext);
			expect(result).toContain('"key": "bare"');
		});

		it("double dots skip empty segments and continue navigation", async () => {
			const result = await injectSessionState("{obj..key}", readonlyContext);
			expect(result).toBe("bare");
		});

		it("keeps opposite quote characters inside quoted bracket keys", async () => {
			const result = await injectSessionState(
				`V={obj.inner["mix'ed"]}`,
				readonlyContext,
			);
			expect(result).toBe("V=ok");
		});

		it("treats numeric and string indices distinctly when both exist", async () => {
			const numeric = await injectSessionState("{items[0]}", readonlyContext);
			const stringKey = await injectSessionState("{map['0']}", readonlyContext);
			expect(numeric).toBe("zero");
			expect(stringKey).toBe("string-zero");
		});

		it("returns empty for optional path through undefined mid-segment", async () => {
			mockContext.session.state = { a: { b: undefined } };
			const result = await injectSessionState("X={a.b.c?}", readonlyContext);
			expect(result).toBe("X=");
		});

		it("resolves quoted keys that contain dots via bracket notation", async () => {
			const result = await injectSessionState(
				"{obj['dot.key']}",
				readonlyContext,
			);
			expect(result).toBe("quoted-dot");
		});
	});

	describe("templates with no or adjacent matches", () => {
		it("returns unchanged text when there are no placeholders", async () => {
			const result = await injectSessionState(
				"plain instruction text",
				readonlyContext,
			);
			expect(result).toBe("plain instruction text");
		});

		it("handles adjacent placeholders with empty gaps", async () => {
			mockContext.session.state = { a: "A", b: "B" };
			const result = await injectSessionState("{a}{b}", readonlyContext);
			expect(result).toBe("AB");
		});

		it("handles placeholders at start and end of the template", async () => {
			mockContext.session.state = { start: "<<", end: ">>" };
			const result = await injectSessionState(
				"{start}middle{end}",
				readonlyContext,
			);
			expect(result).toBe("<<middle>>");
		});

		it("leaves nested braces unmatched by the outer pattern", async () => {
			mockContext.session.state = { outer: "O" };
			const result = await injectSessionState("{{outer}}", readonlyContext);
			expect(result).toBe("{O}");
		});
	});

	describe("optional prefixed and nested state", () => {
		it("returns empty for optional missing prefixed keys", async () => {
			mockContext.session.state = {};
			const result = await injectSessionState(
				"{user:missing?} / {temp:x?}",
				readonlyContext,
			);
			expect(result).toBe(" / ");
		});

		it("injects optional present nested prefixed-style keys via root only", async () => {
			mockContext.session.state = { "user:profile": { city: "NYC" } };
			const result = await injectSessionState(
				"City={user:profile}",
				readonlyContext,
			);
			expect(result).toContain('"city": "NYC"');
		});
	});

	describe("leftover resolution edges", () => {
		it("trims whitespace around optional markers before resolving", async () => {
			mockContext.session.state = { userName: "Ada" };
			const present = await injectSessionState(
				"Hi {  userName?  }!",
				readonlyContext,
			);
			expect(present).toBe("Hi Ada!");

			mockContext.session.state = {};
			const missing = await injectSessionState(
				"Hi {  userName?  }!",
				readonlyContext,
			);
			expect(missing).toBe("Hi !");
		});

		it("resolves nested properties under prefixed state roots", async () => {
			mockContext.session.state = {
				"user:profile": { city: "Lisbon", tags: ["a", "b"] },
			};
			const result = await injectSessionState(
				"{user:profile.city}/{user:profile.tags[1]}",
				readonlyContext,
			);
			expect(result).toBe("Lisbon/b");
		});

		it("treats dotted artifact filenames as a single artifact key", async () => {
			mockContext.artifactService = {
				loadArtifact: vi.fn().mockResolvedValue("csv-body"),
			} as any;

			const result = await injectSessionState(
				"File={artifact.report.csv}",
				readonlyContext,
			);
			expect(result).toBe("File=csv-body");
			expect(mockContext.artifactService.loadArtifact).toHaveBeenCalledWith({
				appName: "test-app",
				userId: "test-user",
				sessionId: "test-session",
				filename: "report.csv",
			});
		});

		it("treats empty-string artifact payloads as missing", async () => {
			mockContext.artifactService = {
				loadArtifact: vi.fn().mockResolvedValue(""),
			} as any;

			await expect(
				injectSessionState("{artifact.empty}", readonlyContext),
			).rejects.toThrow("Artifact empty not found.");

			const optional = await injectSessionState(
				"X={artifact.empty?}",
				readonlyContext,
			);
			expect(optional).toBe("X=");
		});

		it("stringifies function state values via String()", async () => {
			mockContext.session.state = {
				fn() {
					return 1;
				},
			};
			const result = await injectSessionState("F={fn}", readonlyContext);
			expect(result.startsWith("F=")).toBe(true);
			expect(result).toMatch(/fn|function/);
		});

		it("repeats the same placeholder independently", async () => {
			mockContext.session.state = { n: 3 };
			const result = await injectSessionState("{n}+{n}={n}", readonlyContext);
			expect(result).toBe("3+3=3");
		});

		it("injects present optional nested values without stripping them", async () => {
			mockContext.session.state = { user: { age: 41 } };
			const result = await injectSessionState(
				"Age={user.age?}",
				readonlyContext,
			);
			expect(result).toBe("Age=41");
		});

		it("formats whitespace-only strings without treating them as missing", async () => {
			mockContext.session.state = { pad: "   " };
			const result = await injectSessionState("[{pad}]", readonlyContext);
			expect(result).toBe("[   ]");
		});

		it("leaves invalid optional roots as literals including the question mark", async () => {
			const result = await injectSessionState(
				"{bad-name?} {1bad?}",
				readonlyContext,
			);
			expect(result).toBe("{bad-name?} {1bad?}");
		});

		it("resolves bracket paths that mix dots inside and outside quotes", async () => {
			mockContext.session.state = {
				cfg: {
					"a.b": { "c.d": 9 },
				},
			};
			const result = await injectSessionState(
				"V={cfg['a.b']['c.d']}",
				readonlyContext,
			);
			expect(result).toBe("V=9");
		});

		it("throws for required nested miss after an earlier optional success", async () => {
			mockContext.session.state = { a: 1 };
			await expect(
				injectSessionState("{a?} then {missing.nested}", readonlyContext),
			).rejects.toThrow("Context variable not found: `missing.nested`.");
		});

		it("formats deeply nested arrays as indented JSON when injected at root", async () => {
			mockContext.session.state = {
				grid: [
					[1, 2],
					[3, 4],
				],
			};
			const result = await injectSessionState("{grid}", readonlyContext);
			expect(result).toBe(
				"[\n  [\n    1,\n    2\n  ],\n  [\n    3,\n    4\n  ]\n]",
			);
		});

		it("accepts $ in the identifier portion of prefixed names", async () => {
			mockContext.session.state = { "temp:$tmp": "ok" };
			const result = await injectSessionState("{temp:$tmp}", readonlyContext);
			expect(result).toBe("ok");
		});
	});
});
