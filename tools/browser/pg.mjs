// Runs a page command against one tab, retrying when the other Chrome
// profile's extension grabs it and answers "No tab with id"/"No active tab".
// usage: node pg.mjs <cmd> [json-args]  |  node pg.mjs js <file.js>
import { readFileSync } from 'node:fs';
const TAB = Number(process.env.TAB || 799073830);
let [cmd, rawArgs = '{}'] = process.argv.slice(2);
let args;
if (cmd === 'js') {
  cmd = 'eval';
  args = { code: readFileSync(rawArgs, 'utf8'), tab_id: TAB };
} else {
  args = { ...JSON.parse(rawArgs), tab_id: TAB };
}

for (let i = 0; i < 20; i++) {
  const res = await fetch('http://localhost:8788/api/page/exec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cmd, args }),
  });
  const data = await res.json();
  const err = data.error ?? (res.ok ? null : `HTTP ${res.status}`);
  if (err && /No tab with id|No active tab/.test(err)) continue;
  if (err) { console.error(err); process.exit(1); }
  const out = data.result;
  console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 2));
  process.exit(0);
}
console.error('wrong profile answered 20 times in a row');
process.exit(1);
