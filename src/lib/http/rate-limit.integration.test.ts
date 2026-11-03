import { execFile, spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const exec = promisify(execFile);

// Opt in with GHM_REDIS_INTEGRATION=1. Uses only an isolated, temporary local Redis process.
describe.skipIf(process.env.GHM_REDIS_INTEGRATION !== "1")("official SDK against real Redis", () => {
  let process_: ChildProcess;
  let directory: string;
  let socket: string;
  let now: number;

  beforeEach(() => {
    // Fixed windows use the SDK clock; keep subprocess latency from crossing a window mid-test.
    now = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
  });

  afterEach(() => vi.restoreAllMocks());

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "ghm-limit-"));
    socket = join(directory, "redis.sock");
    process_ = spawn("redis-server", ["--port", "0", "--unixsocket", socket, "--save", "", "--appendonly", "no"], { stdio: ["ignore", "pipe", "pipe"] });
    await new Promise<void>((resolve, reject) => {
      process_.on("error", reject);
      process_.stdout!.on("data", (chunk: Buffer) => {
        if (chunk.toString().toLowerCase().includes("ready to accept connections")) resolve();
      });
      process_.on("exit", (code) => reject(new Error(`Temporary Redis exited: ${code}`)));
    });
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://isolated-redis.test");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-only-placeholder");
    // Bridge the official HTTP SDK to the isolated Redis, preserving its actual Lua transactions.
    vi.stubGlobal("fetch", async (_url: string, options: RequestInit) => {
      const body = JSON.parse(options.body as string) as unknown[];
      const command = async (args: unknown[]) => {
        // Upstash's key-locking hint is not understood by stock Redis; the Lua body is identical.
        if (String(args[0]).toUpperCase() === "EVAL") args[1] = String(args[1]).replace(/^#!lua flags=allow-key-locking\n/, "");
        const { stdout } = await exec("redis-cli", ["-s", socket, "--json", ...args.map(String)]).catch((error: { stdout?: string }) => {
          if (error.stdout?.startsWith("error:")) return { stdout: error.stdout };
          throw error;
        });
        if (stdout.startsWith("error:")) return { error: JSON.parse(stdout.slice(6)) as string };
        const result = JSON.parse(stdout) as unknown;
        const encode = (value: unknown): unknown =>
          typeof value === "string" ? Buffer.from(value).toString("base64") : Array.isArray(value) ? value.map(encode) : value;
        return { result: new Headers(options.headers).get("upstash-encoding") === "base64" ? encode(result) : result };
      };
      return Response.json(Array.isArray(body[0]) ? await Promise.all((body as unknown[][]).map(command)) : await command(body));
    });
  }, 10_000);

  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    process_?.kill("SIGTERM");
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("enforces one shared bucket across fresh module instances under concurrent requests", async () => {
    vi.resetModules();
    const first = await import("./rate-limit");
    vi.resetModules();
    const second = await import("./rate-limit");
    const rule = { key: "concurrent-ip", limit: 5, windowMs: 60_000 };
    const results = await Promise.all(Array.from({ length: 20 }, (_, index) => (index % 2 ? first : second).takeLimits([rule])));
    expect(results.filter((result) => result.allowed)).toHaveLength(5);
    expect(results.filter((result) => !result.allowed && !result.unavailable)).toHaveLength(15);
    expect(await second.takeLimits([{ ...rule, key: "different-ip" }])).toEqual({ allowed: true });
  }, 15_000);

  it("caps a shared budget across identities and resets at the fixed-window boundary", async () => {
    const { takeLimits } = await import("./rate-limit");
    const budget = { key: "shared-budget", limit: 2, windowMs: 1000 };
    expect((await takeLimits([{ ...budget, key: "ip-a" }, budget])).allowed).toBe(true);
    expect((await takeLimits([{ ...budget, key: "ip-b" }, budget])).allowed).toBe(true);
    expect(await takeLimits([{ ...budget, key: "ip-c" }, budget])).toMatchObject({ allowed: false, unavailable: false });
    now += 999;
    expect(await takeLimits([budget])).toMatchObject({ allowed: false, unavailable: false });
    now += 1;
    expect((await takeLimits([budget])).allowed).toBe(true);
  }, 10_000);
});
