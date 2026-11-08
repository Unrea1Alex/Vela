// Optional browser acceptance; no Node/browser dependency in BuildLens itself.
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const directory = dirname(fileURLToPath(import.meta.url));
const edge = process.env.BUILDLENS_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = await mkdtemp(join(tmpdir(), 'buildlens-browser-'));
const browser = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const pending = new Map();
let socket, id = 0;
const checks = [];
function check(condition, label) { if (!condition) throw new Error(label); checks.push(label); }
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
    pending.set(key, { resolve: value => { clearTimeout(timer); resolve(value); }, reject });
    socket.send(JSON.stringify({ id: key, method, params }));
  });
}
async function evaluate(expression) {
  const value = await send('Runtime.evaluate', { expression, returnByValue: true });
  if (value.exceptionDetails) throw new Error(JSON.stringify(value.exceptionDetails));
  return value.result.value;
}
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await delay(100); }
  }
  if (!port) throw new Error('Browser did not start');
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const item = pending.get(message.id);
    if (item) { pending.delete(message.id); message.error ? item.reject(new Error(JSON.stringify(message.error))) : item.resolve(message.result); }
  });
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1400, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: pathToFileURL(join(directory, 'demo-report.html')).href });
  for (let i = 0; i < 100; i++) { if (await evaluate("document.readyState === 'complete' && !!document.getElementById('search')")) break; await delay(50); }
  const visible = "[...document.querySelectorAll('tbody tr')].filter(row=>!row.hidden).length";
  check(await evaluate(visible) === 11, '11 initial rows');
  check(await evaluate("[...document.querySelectorAll('.card strong')].map(e=>e.textContent).join(',')") === '11,2,2,14', 'literal summary cards');
  await evaluate("document.getElementById('problems').click()");
  check(await evaluate(visible) === 3, 'problems toggle includes failed and flaky');
  await evaluate("document.getElementById('search').value='AUTH';document.getElementById('search').dispatchEvent(new Event('input'))");
  check(await evaluate(visible) === 1, 'case-insensitive search combined with problems');
  await evaluate("document.getElementById('problems').click()");
  check(await evaluate(visible) === 2, 'suite search includes clean test');
  await evaluate("document.getElementById('search').value='нет такого';document.getElementById('search').dispatchEvent(new Event('input'))");
  check(await evaluate(visible) === 0 && await evaluate("!document.getElementById('empty').hidden"), 'empty filter state');
  await evaluate("document.getElementById('search').value='';document.getElementById('search').dispatchEvent(new Event('input'))");
  check(await evaluate(visible) === 11, 'reset restores all rows');
  check(await evaluate("document.querySelectorAll('script').length === 1 && document.querySelectorAll('[src],link').length === 0"), 'no external assets');
  const desktop = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(directory, 'preview.png'), Buffer.from(desktop.data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  check(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'mobile body fits viewport');
  check(await evaluate("document.querySelector('.scroll').scrollWidth > document.querySelector('.scroll').clientWidth"), 'mobile table scrolls inside panel');
  const mobile = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(directory, 'preview-mobile.png'), Buffer.from(mobile.data, 'base64'));
  const receipt = { passed: checks.length, failed: 0, checks, browser: (await send('Browser.getVersion')).product, viewport: { desktop: [1440, 1400], mobile: [390, 844] } };
  await writeFile(join(directory, 'validation-html.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
} finally {
  if (socket?.readyState === WebSocket.OPEN) { try { await send('Browser.close'); } catch {} socket.close(); }
  if (browser.exitCode === null) browser.kill();
}
