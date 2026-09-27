import { createInterface } from "node:readline";
import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { JsonRpcConnection, RpcError } from "./rpc";

function setup() {
  const fromServer = new PassThrough();
  const toServer = new PassThrough();
  const rpc = new JsonRpcConnection(fromServer, toServer);
  const sent: Record<string, unknown>[] = [];
  createInterface({ input: toServer }).on("line", (l) =>
    sent.push(JSON.parse(l)),
  );
  const reply = (msg: object) => fromServer.write(`${JSON.stringify(msg)}\n`);
  const nextSent = async () => {
    await new Promise((r) => setImmediate(r));
    return sent.shift();
  };
  return { rpc, reply, nextSent, fromServer };
}

describe("JsonRpcConnection", () => {
  it("matches responses to requests by id", async () => {
    const { rpc, reply, nextSent } = setup();
    const a = rpc.request("a", { x: 1 });
    const b = rpc.request("b", {});
    const sentA = await nextSent();
    const sentB = await nextSent();
    expect(sentA).toEqual({ id: 1, method: "a", params: { x: 1 } });

    reply({ id: sentB!.id, result: "B" });
    reply({ id: sentA!.id, result: "A" });
    await expect(a).resolves.toBe("A");
    await expect(b).resolves.toBe("B");
  });

  it("rejects with RpcError on an error response", async () => {
    const { rpc, reply, nextSent } = setup();
    const p = rpc.request("bad", {});
    const sent = await nextSent();
    reply({ id: sent!.id, error: { code: -32600, message: "nope" } });
    await expect(p).rejects.toMatchObject({
      name: "RpcError",
      code: -32600,
      message: "nope",
    });
    await expect(p).rejects.toBeInstanceOf(RpcError);
  });

  it("dispatches notifications and ignores non-JSON lines", async () => {
    const { rpc, fromServer } = setup();
    const seen: string[] = [];
    rpc.onNotification((method) => seen.push(method));
    fromServer.write("some log line\n");
    fromServer.write(
      `${JSON.stringify({ method: "turn/started", params: {} })}\n`,
    );
    await new Promise((r) => setImmediate(r));
    expect(seen).toEqual(["turn/started"]);
  });

  it("answers server-initiated requests with an error by default", async () => {
    const { reply, nextSent } = setup();
    reply({
      id: 99,
      method: "item/commandExecution/requestApproval",
      params: {},
    });
    await new Promise((r) => setImmediate(r));
    const answer = await nextSent();
    expect(answer).toMatchObject({ id: 99, error: { code: -32601 } });
  });

  it("rejects pending and future requests once the stream closes", async () => {
    const { rpc, fromServer } = setup();
    const p = rpc.request("slow", {});
    fromServer.end();
    await expect(p).rejects.toThrow(/closed/);
    await expect(rpc.request("later", {})).rejects.toThrow(/closed/);
  });

  it("times out requests", async () => {
    const { rpc } = setup();
    await expect(rpc.request("never", {}, { timeoutMs: 20 })).rejects.toThrow(
      /timed out/,
    );
  });
});
