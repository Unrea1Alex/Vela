import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { connect } from "node:net";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

const child = spawn(resolve(process.argv[2]), [], { windowsHide: true });
const exited = once(child, "exit");
const lines = createInterface({ input: child.stdout });
let stderr = "";
child.stderr.setEncoding("utf8").on("data", (data) => { stderr += data; });
const [announcement] = await Promise.race([
  once(lines, "line"),
  exited.then(([code]) => { throw new Error(`server exited ${code}: ${stderr}`); }),
]);
assert.match(announcement, /^port=[1-9][0-9]*$/);
const port = Number(announcement.slice(5));
const timeout = setTimeout(() => child.kill(), 15000);
const sockets = new Set();

async function open() {
  const socket = connect({ host: "127.0.0.1", port });
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
  const chunks = [];
  socket.on("data", (chunk) => chunks.push(chunk));
  const response = once(socket, "end").then(() => Buffer.concat(chunks));
  response.catch(() => {});
  await once(socket, "connect");
  return { socket, response };
}

async function request(wire, status, body) {
  const { socket, response } = await open();
  socket.write(wire);
  try {
    check(await response, status, body);
  } catch (cause) {
    throw new Error(`request ${wire.slice(0, 48)} (expected ${status})`, { cause });
  }
}

function check(wire, status, body) {
  const separator = wire.indexOf("\r\n\r\n");
  assert.ok(separator > 0, wire.toString());
  const header = wire.subarray(0, separator).toString();
  assert.match(header, new RegExp(`^HTTP/1.1 ${status} `));
  assert.match(header, /\r\nConnection: close\r\n/);
  const actual = wire.subarray(separator + 4);
  assert.equal(Number(header.match(/\r\nContent-Length: (\d+)$/)[1]), actual.length);
  if (body) assert.deepEqual(actual, body);
}

try {
  const slow = await open();
  slow.socket.write("G");
  await request("GET /binary HTTP/1.1\r\nhOsT: localhost\r\n\r\n", 200, Buffer.from([86, 101, 108, 97, 0, 255]));
  assert.equal(slow.socket.readableEnded, false);
  const fragmented = await open();
  fragmented.socket.write("GET /missing HTTP/1.1\r\nHost: localhost\r");
  await new Promise((ready) => setTimeout(ready, 40));
  fragmented.socket.write("\n\r\n");
  check(await fragmented.response, 404, Buffer.from("/missing"));
  await request("GET /large HTTP/1.1\r\nHost: localhost\r\n\r\n", 200, Buffer.alloc(1048576, "z"));
  const typed=await open();typed.socket.write("GET /typed HTTP/1.1\r\nHost: localhost\r\n\r\n");
  const typedWire=await typed.response;check(typedWire,200,Buffer.from('{}'));assert.match(typedWire.toString(),/Content-Type: application\/json\r\n/);
  await request("GET /bad-type HTTP/1.1\r\nHost: localhost\r\n\r\n",500);
  for(const [target,status,length]of [['/large',200,1048576],['/bad-type',500,25]]) {
    const head=await open();head.socket.write(`HEAD ${target} HTTP/1.1\r\nHost: localhost\r\n\r\n`);
    const wire=await head.response,split=wire.indexOf('\r\n\r\n');assert.ok(split>0);
    assert.match(wire.toString(),new RegExp(`^HTTP/1.1 ${status} `));
    assert.match(wire.toString(),new RegExp(`Content-Length: ${length}\\r\\n`));
    assert.equal(wire.length,split+4,'HEAD has no bytes after headers');
  }
  await request("POST / HTTP/1.1\r\nHost: localhost\r\nContent-Length: 0\r\n\r\n",400);
  for(const [requestLine,status]of [["HEAD / HTTP/1.1\r\n\r\n",400],["HEAD / HTTP/1.1\r\nHost: localhost\r\nX-Long: ".padEnd(8192,"a"),431]]) {
    const head=await open();head.socket.write(requestLine);
    const wire=await head.response,split=wire.indexOf('\r\n\r\n');assert.ok(split>0);
    assert.match(wire.toString(),new RegExp(`^HTTP/1.1 ${status} `));
    assert.equal(wire.length,split+4,'HEAD rejection has no body');
  }
  await request("GET / HTTP/1.1\r\n\r\n", 400);
  await request("GET / HTTP/1.1\r\nHost: localhost\r\nContent-Length: 3\r\n\r\n", 400);
  await request("GET / HTTP/1.1\r\nHost: localhost\r\nTransfer-Encoding: chunked\r\n\r\n", 400);
  await request("GET / HTTP/1.1\r\nHost: localhost\r\nX-Long: ".padEnd(8192, "a"), 431);
  const incomplete = await slow.response.catch((error) => {
    assert.equal(error.code, "ECONNRESET");
    return Buffer.alloc(0);
  });
  assert.equal(incomplete.length, 0);
  const [code] = await exited;
  assert.equal(code, 0, stderr);
  const closed = connect({ host: "127.0.0.1", port });
  const [error] = await once(closed, "error");
  assert.equal(error.code, "ECONNREFUSED");
  console.log(JSON.stringify({ passed: 16, concurrent: true, binary: true, bodyBytes: 1048576,head:true,contentType:true }));
} finally {
  clearTimeout(timeout);
  for (const socket of sockets) socket.destroy();
  if (child.exitCode === null) child.kill();
}
