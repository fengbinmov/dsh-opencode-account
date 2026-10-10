/**
 * Ask the gateway which reasoning-effort levels each configured model really accepts.
 *
 *   node scripts/probe-effort.mjs                 # every model on a completions/messages route
 *   node scripts/probe-effort.mjs qwen3.8-max …   # only the named models
 *
 * Why: pi-ai's catalog carries a `thinkingLevelMap` per model, and that table is
 * wrong in BOTH directions. Measured 2026-10:
 *
 *   UNDER-reported — `qwen3.8-max` was low/medium/xhigh, `kimi-k3` was max-only
 *     and `kimi-k2.6` offered nothing at all, while the gateway answers 200 for
 *     all six levels on all three.
 *   OVER-reported — pi-ai reads a MISSING map as "every level", and the gateway
 *     rejects `max` on both `qwen3.6-plus` and `qwen3.7-max`.
 *
 * Under-reporting is not a missing option. A route's default effort is validated
 * against this table on the REQUEST path
 * (`resolveReasoningLevel(model, options.reasoningEffort ?? profile.reasoning)`),
 * so a model whose table omits `high` fails EVERY request with
 * `UNSUPPORTED_REASONING_EFFORT` — which is exactly what happened to
 * `qwen3.8-max` and `kimi-k3` before `PINNED_FIELDS` corrected them.
 *
 * Neither metadata source agrees with the gateway on those rows, so this asks the
 * gateway. A model is reported as ACCEPTING a level only on a 200; a rejection is
 * reported as such (the gateway answers `invalid_parameter_error`), and an
 * unreachable endpoint is called out rather than counted either way.
 *
 * The `openai-responses` route is skipped: its reasoning dispatch is not
 * `thinking` + `reasoning_effort`, so the same probe would not mean the same
 * thing there.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const require = createRequire(import.meta.url);
const SESSION = '7f3c1a92-5d84-4e6b-9c07-2ab5e13f8d40';
const BASE = 'https://opencode.ai/zen/go/v1';
const CONCURRENCY = 2;
const LEVELS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

/** js-yaml lives in dsh's tree, not in this checkout; search every install shape. */
function loadJsYaml() {
	const home = process.env.USERPROFILE ?? process.env.HOME ?? '';
	const appData = process.env.APPDATA ?? '';
	const roots = [
		process.env.DSH_NODE_MODULES,
		home === '' ? undefined : join(home, '.dsh', 'profiles', 'node_modules'),
		home === '' ? undefined : join(home, '.dsh', 'profiles', 'web', 'node_modules'),
		appData === '' ? undefined : join(appData, 'npm', 'node_modules'),
		appData === '' ? undefined : join(appData, 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules'),
	].filter((candidate) => candidate !== undefined && candidate !== '');
	for (const candidate of roots) {
		try {
			const loaded = require(join(candidate, 'js-yaml', 'index.js'));
			return loaded.default ?? loaded;
		} catch {
			// Try the next root.
		}
	}
	throw new Error('js-yaml not found; install the plugin into a dsh profile first');
}

const jsYaml = loadJsYaml();

/** Credential resolution, in the same order the plugin uses. */
function readApiKey() {
	if (process.env.OPENCODE_API_KEY !== undefined) return process.env.OPENCODE_API_KEY;
	const dshHome = process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh');
	try {
		const match = /^\s+OPENCODE_API_KEY:\s*(.+?)\s*$/m.exec(readFileSync(join(dshHome, '.credentials.yaml'), 'utf8'));
		if (match) return match[1];
	} catch {
		// Fall through to the failure below.
	}
	throw new Error('no OPENCODE_API_KEY available (env or $DSH_HOME/.credentials.yaml)');
}

/** Every configured model with the protocol of the route that serves it. */
function configured() {
	const patch = jsYaml.load(readFileSync(join(root, 'cordis.patch.yml'), 'utf8'));
	const entry = patch.find((row) => row?.id === 'llm-pi-ai');
	const providers = entry?.config?.providers ?? {};
	const byModel = new Map();
	for (const [route, profile] of Object.entries(providers)) {
		for (const model of profile.models ?? []) {
			if (model.id !== undefined) byModel.set(model.id, { route, api: profile.api, baseURL: profile.baseURL });
		}
	}
	return byModel;
}

/** One attempt; 200 means the level is accepted, anything else is a rejection. */
async function attempt(model, api, baseURL, level, key, withThinking) {
	const messages = api === 'anthropic-messages';
	const headers = {
		authorization: `Bearer ${key}`,
		'x-opencode-session': SESSION,
		'content-type': 'application/json',
	};
	if (messages) headers['x-api-key'] = key;
	const body = messages
		? {
				model,
				// `max_tokens` must EXCEED `budget_tokens` on this protocol; pi-ai enforces
				// the same relationship itself (`Math.min(budget, maxTokens - 1024)`), so
				// 1024/1024 here would report a rejection that no real request produces.
				max_tokens: 2048,
				// This protocol has TWO dispatch forms and the gateway picks one per
				// model. `withThinking` selects the budget form; the other is the
				// adaptive form pi-ai uses when `forceAdaptiveThinking` is set, which
				// is what `claude-haiku-5-5` demands (it refuses the budget form with
				// `"thinking.type.enabled" is not supported for this model`).
				...(withThinking
					? { thinking: { type: 'enabled', budget_tokens: 1024 } }
					: { thinking: { type: 'adaptive', display: 'summarized' }, output_config: { effort: level } }),
				messages: [{ role: 'user', content: 'What is 17*23?' }],
			}
		: {
				model,
				messages: [{ role: 'user', content: 'What is 17*23?' }],
				max_tokens: 512,
				// `withThinking` selects the deepseek-style shape; the other shape is
				// what pi-ai sends for a route it does not ship, and some endpoints
				// (measured: omen-alpha) reject the `thinking` field outright while
				// accepting the effort alone.
				...(withThinking ? { thinking: { type: 'enabled' } } : {}),
				reasoning_effort: level,
			};
	// The messages route's baseURL stops at `/zen/go` because the Anthropic SDK
	// appends `/v1/messages`; spelling the path here must add the `/v1` itself.
	const url = `${(baseURL ?? BASE).replace(/\/$/, '')}${messages ? '/v1/messages' : '/chat/completions'}`;
	try {
		const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
		const text = await res.text();
		if (res.ok) return { ok: true };
		const parsed = (() => {
			try {
				return JSON.parse(text);
			} catch {
				return {};
			}
		})();
		const message = JSON.stringify(parsed.error ?? parsed);
		if (/unknown field|unknown_parameter/i.test(message)) return { ok: false, note: 'rejects the thinking field' };
		if (/invalid_parameter|Unsupported|not supported/i.test(message)) return { ok: false, note: 'rejected' };
		return { ok: false, note: `HTTP ${res.status}` };
	} catch (error) {
		return { ok: false, note: error instanceof Error ? error.message.slice(0, 60) : String(error) };
	}
}

/** Try both dispatch shapes for one level; either one answering 200 counts. */
async function acceptsLevel(model, api, baseURL, level, key) {
	const first = await attempt(model, api, baseURL, level, key, true);
	if (first.ok) return { ok: true };
	const second = await attempt(model, api, baseURL, level, key, false);
	if (second.ok) return { ok: true };
	return { ok: false, note: second.note ?? first.note };
}

const key = readApiKey();
const byModel = configured();
const requested = process.argv.slice(2);
const ids = requested.length > 0 ? requested : [...byModel.keys()].filter((id) => byModel.get(id).api !== 'openai-responses');
/**
 * `PROBE_LEVELS=high` narrows the sweep to one level, which is the cheap way to
 * ask the only question a route default cares about: "does every model on this
 * route accept the level the route defaults to?" The full six-level sweep is for
 * finding new exceptions.
 */
const sweep = process.env.PROBE_LEVELS === undefined ? LEVELS : process.env.PROBE_LEVELS.split(',').map((level) => level.trim());
console.log(`probing ${ids.length} models for real effort acceptance (levels: ${sweep.join(', ')})…\n`);

const verdicts = new Map();
for (let index = 0; index < ids.length; index += CONCURRENCY) {
	const slice = ids.slice(index, index + CONCURRENCY);
	const probed = await Promise.all(
		slice.map(async (id) => {
			const info = byModel.get(id);
			if (info === undefined) return { id, verdict: 'unknown', note: 'not declared in cordis.patch.yml' };
			const accepted = [];
			let rejectionNote;
			let unreachable = false;
			for (const level of sweep) {
				const result = await acceptsLevel(id, info.api, info.baseURL, level, key);
				if (result.ok) accepted.push(level);
				else if (result.note?.startsWith('HTTP 5') || result.note?.includes('unavailable')) unreachable = true;
				else rejectionNote = rejectionNote ?? result.note;
			}
			return { id, verdict: unreachable && accepted.length === 0 ? 'unreachable' : 'probed', accepted, rejectionNote, api: info.api };
		}),
	);
	for (const entry of probed) {
		verdicts.set(entry.id, entry);
		const tag = entry.verdict === 'unreachable' ? 'UNREACHABLE' : entry.verdict === 'unknown' ? 'NOT-DECLARED' : 'OK';
		const detail =
			entry.verdict === 'probed'
				? `accepted [${entry.accepted.join(', ') || 'none'}]${entry.rejectionNote === undefined ? '' : `  (${entry.rejectionNote})`}`
				: entry.note ?? 'endpoint did not answer for any level';
		console.log(`${tag.padEnd(13)} ${entry.id.padEnd(30)} ${detail}`);
	}
}

const probed = [...verdicts.values()].filter((entry) => entry.verdict === 'probed');
// Compared against the levels actually swept, not the full list: a one-level run
// that accepts that level is a pass, not a partial.
const partial = probed.filter((entry) => entry.accepted.length > 0 && entry.accepted.length < sweep.length);
const none = probed.filter((entry) => entry.accepted.length === 0);

console.log(`\nprobed ${probed.length} | accepts every level ${probed.length - partial.length - none.length} | partial ${partial.length} | none ${none.length}`);

/**
 * The correction belongs in code, not in a generated artifact: the useful output
 * is the handful of rows that disagree with pi-ai, and a constant is easier to
 * review than a file. Same reasoning as `probe-protocol.mjs`.
 */
if (partial.length > 0) {
	console.log('\nThese accept only some levels — pin them in PINNED_FIELDS if pi-ai disagrees:');
	for (const entry of partial) {
		const map = entry.accepted.map((level) => `${level}: '${level}'`).join(', ');
		console.log(`\t'${entry.id}': { thinkingLevelMap: { ${map} } },`);
	}
}
if (none.length > 0) {
	console.log('\nThese accepted no level at all. They cannot sit on a route with a default effort —');
	console.log('give them a route with no `reasoning`, or declare `reasoningEfforts: false` on one:');
	for (const entry of none) console.log(`\t${entry.id}  (${entry.rejectionNote ?? 'no note'})`);
}
if (partial.length === 0 && none.length === 0) console.log('\nevery probed model accepts every level — no corrections needed');
