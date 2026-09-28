/**
 * Verify every configured model on the wire protocol its route declares.
 *
 *   node scripts/probe-protocol.mjs
 *
 * Why: the route decides the protocol, and a wrong guess makes the model
 * unusable in DSH — `minimax-m2.7` was configured on `openai-completions` while
 * the gateway only serves it on `messages`, so picking it returned
 * `400 ModelProtocolUnsupported`. Reading the docs' endpoint table is not
 * enough; this asks the gateway.
 *
 * A failure is only reported as a WRONG PROTOCOL when the gateway actually says
 * so (`ModelProtocolUnsupported`, or a 404 on the route). Failures from region
 * blocks, data-policy refusals or a disabled endpoint are reported as BLOCKED —
 * those say nothing about the protocol.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const SESSION = '7f3c1a92-5d84-4e6b-9c07-2ab5e13f8d40';
const CONCURRENCY = 3;
const BASE = 'https://opencode.ai/zen/go/v1';

/** Minimal text request per protocol. */
function requestFor(protocol, model) {
	if (protocol === 'openai-responses') {
		return { path: '/responses', body: { model, input: 'say ok', max_output_tokens: 24 } };
	}
	if (protocol === 'anthropic-messages') {
		return { path: '/messages', headers: { 'x-api-key': '' }, body: { model, max_tokens: 16, messages: [{ role: 'user', content: 'say ok' }] } };
	}
	return { path: '/chat/completions', body: { model, messages: [{ role: 'user', content: 'say ok' }], max_tokens: 16 } };
}

function readApiKey() {
	const dshHome = process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh');
	const raw = readFileSync(join(dshHome, '.credentials.yaml'), 'utf8');
	const match = /^\s+OPENCODE_API_KEY:\s*(.+?)\s*$/m.exec(raw);
	if (match) return process.env.OPENCODE_API_KEY ?? match[1];
	if (process.env.OPENCODE_API_KEY !== undefined) return process.env.OPENCODE_API_KEY;
	throw new Error('no OPENCODE_API_KEY available');
}

/** Configured protocol per model, read out of the settings document. */
function configured() {
	const dshHome = process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh');
	const source = readFileSync(join(dshHome, 'settings.yaml'), 'utf8');
	const byModel = new Map();
	let api;
	for (const line of source.split(/\r?\n/)) {
		const route = /^\s+api:\s*(\S+)\s*$/.exec(line);
		if (route) {
			api = route[1];
			continue;
		}
		const model = /^\s+- id:\s*(\S+)\s*$/.exec(line);
		if (model && api !== undefined) byModel.set(model[1], api);
	}
	return byModel;
}

const key = readApiKey();
const protocols = configured();
const ALL = ['openai-completions', 'openai-responses', 'anthropic-messages'];

/** One attempt; returns {ok, protocolError, note}. */
async function attempt(protocol, model) {
	const spec = requestFor(protocol, model);
	const headers = { authorization: `Bearer ${key}`, 'x-opencode-session': SESSION, 'content-type': 'application/json', ...(spec.headers ?? {}) };
	if (headers['x-api-key'] === '') headers['x-api-key'] = key;
	try {
		const res = await fetch(`${BASE}${spec.path}`, {
			method: 'POST',
			headers,
			body: JSON.stringify(spec.body),
			signal: AbortSignal.timeout(90000),
		});
		const text = await res.text();
		if (res.ok) return { ok: true, protocolError: false, note: `${protocol} ok` };
		const body = (() => {
			try {
				return JSON.parse(text);
			} catch {
				return {};
			}
		})();
		const message = JSON.stringify(body.error ?? body).slice(0, 120);
		const protocolError = /ModelProtocolUnsupported|Cannot find any route matching/i.test(message);
		return { ok: false, protocolError, note: `${protocol} HTTP ${res.status}: ${message}` };
	} catch (error) {
		return { ok: false, protocolError: false, note: `${protocol} ${error instanceof Error ? error.message.slice(0, 80) : error}` };
	}
}

const ids = [...protocols.keys()];
console.log(`verifying ${ids.length} models on their configured protocol…\n`);
const verdicts = new Map();
for (let index = 0; index < ids.length; index += CONCURRENCY) {
	const probed = await Promise.all(
		ids.slice(index, index + CONCURRENCY).map(async (model) => {
			const configuredAs = protocols.get(model);
			const first = await attempt(configuredAs, model);
			if (first.ok) return { model, verdict: 'ok', configuredAs, note: first.note };
			if (!first.protocolError) return { model, verdict: 'blocked', configuredAs, note: first.note };
			// The gateway says the protocol is wrong — find the one that works.
			const working = [];
			for (const candidate of ALL.filter((p) => p !== configuredAs)) {
				const tried = await attempt(candidate, model);
				if (tried.ok) working.push(candidate);
			}
			return { model, verdict: working.length > 0 ? 'wrong-protocol' : 'unusable', configuredAs, working, note: first.note };
		}),
	);
	for (const entry of probed) {
		verdicts.set(entry.model, entry);
		const tag = entry.verdict === 'ok' ? 'OK      ' : entry.verdict === 'wrong-protocol' ? 'PROTOCOL' : entry.verdict === 'blocked' ? 'blocked ' : 'UNUSABLE';
		const extra = entry.working !== undefined ? ` → works on: ${entry.working.join(', ')}` : '';
		console.log(`${tag} ${entry.model.padEnd(30)} ${entry.note.slice(0, 78)}${extra}`);
	}
}

const wrong = [...verdicts.values()].filter((v) => v.verdict === 'wrong-protocol');
const unusable = [...verdicts.values()].filter((v) => v.verdict === 'unusable');
const blocked = [...verdicts.values()].filter((v) => v.verdict === 'blocked');

console.log(
	`\nok ${ids.length - wrong.length - unusable.length - blocked.length} | wrong protocol ${wrong.length} | blocked ${blocked.length} | unusable ${unusable.length}`,
);
for (const entry of wrong) console.log(`  FIX ${entry.model}: ${entry.configuredAs} → ${entry.working.join('/')}`);
for (const entry of unusable) console.log(`  NO WORKING PROTOCOL: ${entry.model}`);
for (const entry of blocked) console.log(`  blocked by the provider: ${entry.model} — ${entry.note.slice(0, 90)}`);

/**
 * The correction lives in code, not in a generated file: the probe's full output
 * is a long list of "agrees with the declaration" plus the handful of genuine
 * exceptions, and only the exceptions are worth keeping. So this prints the
 * ready-to-paste constant instead of writing an artifact.
 */
if (wrong.length > 0) {
	console.log('\nAdd these to PROTOCOL_FIXES in scripts/build-provider-models.mjs, then re-run it:');
	for (const entry of wrong) {
		console.log(`\t['${entry.model}', '${entry.working[0]}'], // ${entry.configuredAs} → ${entry.working[0]}`);
	}
} else if (unusable.length === 0) {
	console.log('\nno protocol corrections needed');
}
