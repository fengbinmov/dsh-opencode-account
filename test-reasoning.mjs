// Reasoning-level contract: what the picker's options actually put on the wire.
//
//   node test-reasoning.mjs
//
// The picker's `default` ("provider default") is NOT a tier — it and `Off`
// produce byte-identical requests, both asking the provider to DISABLE
// thinking. That is surprising enough that a silent upstream change (dsh
// normalizing `off` differently, or pi-ai no longer emitting `thinking`) would
// be invisible until someone's sessions quietly stopped thinking — so the
// mapping is pinned here.
//
// No network: pi-ai's own API layer is driven with a stub `fetch`, and the body
// it builds is what this file inspects. That is the same path dsh uses
// (`streamSimple`, which performs the reasoning → reasoningEffort conversion).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DSH = join(
	process.env.APPDATA ?? '',
	'npm',
	'node_modules',
	'@deepseek-ai',
	'dsh',
	'node_modules',
);
const piAi = join(DSH, '@earendil-works', 'pi-ai', 'dist');

const { openAICompletionsApi } = await import(
	`file://${join(piAi, 'api', 'openai-completions.lazy.js').replace(/\\/g, '/')}`
);
const catalog = JSON.parse(
	readFileSync(join(piAi, 'providers', 'data', 'opencode-go.json'), 'utf8'),
);

/** One catalog model, as the adapter hands it to pi-ai. */
function modelFor(id) {
	for (const models of Object.values(catalog)) {
		if (models[id] !== undefined) return { ...models[id], provider: 'opencode-go' };
	}
	throw new Error(`opencode-go catalog has no model "${id}"`);
}

/** Capture the request body pi-ai builds for one reasoning setting. */
async function bodyFor(model, reasoning) {
	let body;
	const fetchStub = async (_url, init) => {
		body = JSON.parse(init.body);
		return new Response(
			JSON.stringify({
				id: 'stub',
				object: 'chat.completion',
				choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
			}),
			{ status: 200, headers: { 'content-type': 'application/json' } },
		);
	};
	const api = openAICompletionsApi();
	const options = { apiKey: 'stub', fetch: fetchStub, ...(reasoning === undefined ? {} : { reasoning }) };
	const result = api.streamSimple(model, { messages: [{ role: 'user', content: 'hi' }] }, options);
	try {
		if (result !== null && typeof result[Symbol.asyncIterator] === 'function') {
			for await (const _chunk of result) break;
		} else if (result !== null && typeof result.then === 'function') {
			await result;
		}
	} catch {
		// The stub response may not satisfy every stream expectation; the body is
		// captured before that matters.
	}
	if (body === undefined) throw new Error('pi-ai built no request body');
	return body;
}

const model = modelFor('deepseek-v4-flash');
console.log('model:', model.id, '| thinkingFormat:', model.compat.thinkingFormat);
console.log('thinkingLevelMap:', JSON.stringify(model.thinkingLevelMap));

const omitted = await bodyFor(model, undefined);
const off = await bodyFor(model, 'off');
const low = await bodyFor(model, 'low');
const high = await bodyFor(model, 'high');

const show = (label, body) =>
	console.log(
		`  ${label.padEnd(18)} thinking=${JSON.stringify(body.thinking)}  reasoning_effort=${JSON.stringify(body.reasoning_effort)}`,
	);

console.log('\nwhat each picker option actually sends:');
show('default (no value)', omitted);
show('Off', off);
show('Low', low);
show('High', high);

// The whole point of this file: `default` and `Off` must stay identical, and
// both must stay a DISABLE request. A named tier must enable thinking and
// carry its wire spelling.
if (JSON.stringify(omitted) !== JSON.stringify(off)) {
	throw new Error('`default` and `Off` no longer produce the same request — re-check the picker copy');
}
if (omitted.thinking?.type !== 'disabled') {
	throw new Error(`\`default\` should ask for disabled thinking, got ${JSON.stringify(omitted.thinking)}`);
}
if (omitted.reasoning_effort !== undefined) {
	throw new Error('`default` must not carry a reasoning_effort');
}
for (const [level, body] of [
	['low', low],
	['high', high],
]) {
	if (body.thinking?.type !== 'enabled') {
		throw new Error(`\`${level}\` should enable thinking, got ${JSON.stringify(body.thinking)}`);
	}
	if (body.reasoning_effort !== level) {
		throw new Error(`\`${level}\` should send reasoning_effort "${level}", got ${JSON.stringify(body.reasoning_effort)}`);
	}
}

console.log('\ntest-reasoning OK — `default` ≡ `Off` (both request thinking:disabled), named tiers enable it');
