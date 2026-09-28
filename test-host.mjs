// Offline + live harness for the node half: register the plugin against a fake
// context, capture the `/opencode/account` route, call it with a real request
// and response, and assert the payload.
//
//   node test-host.mjs            # live: needs a stored OPENCODE_API_KEY
//   node test-host.mjs --offline  # no network: asserts the missing-credential path
//
// The key is resolved through the harness credential store exactly like the
// running plugin resolves it, so this also proves the credential reference works.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { apply } from './lib/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const offline = process.argv.includes('--offline');

/** Minimal read of `$DSH_HOME/.credentials.yaml`'s `refs:` block. */
function readCredentialRefs() {
	const dshHome = process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh');
	const raw = readFileSync(join(dshHome, '.credentials.yaml'), 'utf8');
	const refs = {};
	let inRefs = false;
	for (const line of raw.split(/\r?\n/)) {
		if (/^refs:\s*$/.test(line)) {
			inRefs = true;
			continue;
		}
		if (inRefs && /^\S/.test(line)) break;
		if (!inRefs) continue;
		const match = /^\s+([A-Za-z0-9_]+):\s*(.+?)\s*$/.exec(line);
		if (match) refs[match[1]] = match[2];
	}
	return refs;
}

const refs = offline ? {} : readCredentialRefs();
const credentials = {
	resolve: async (name) => (refs[name] === undefined ? undefined : { value: refs[name] }),
};

let route;
const ctx = {
	get: (name) => (name === 'credentials' ? credentials : undefined),
	credentials,
	inject: (names, callback) => {
		if (!names.includes('webServer')) throw new Error(`unexpected inject: ${names.join(',')}`);
		callback({
			webServer: {
				register: (spec) => {
					route = spec;
					return () => {};
				},
			},
			effect: (fn) => fn(),
		});
	},
};

apply(ctx, { plan: 'go-plus' });
if (route === undefined) throw new Error('the plugin did not register a route');
console.log('route:', route.kind, route.path);
if (route.kind !== 'exact' || route.path !== '/opencode/account') {
	throw new Error('the route must be an exact GET /opencode/account');
}

/** A response double that captures what the handler wrote. */
function makeResponse() {
	return {
		statusCode: 0,
		headers: {},
		body: '',
		setHeader(name, value) {
			this.headers[name.toLowerCase()] = value;
		},
		end(body) {
			this.body = body;
		},
	};
}

const res = makeResponse();
await route.handler({ method: 'GET', url: '/opencode/account' }, res);
if (res.statusCode !== 200) throw new Error(`expected HTTP 200, got ${res.statusCode}`);
const payload = JSON.parse(res.body);

if (offline) {
	if (payload.ok !== false || payload.code !== 'MISSING_CREDENTIAL') {
		throw new Error(`offline: expected MISSING_CREDENTIAL, got ${JSON.stringify(payload).slice(0, 200)}`);
	}
	if (!String(payload.error).includes('OPENCODE_API_KEY')) throw new Error('offline: the hint must name the reference');
	console.log('offline payload ok: MISSING_CREDENTIAL with a usable hint');
} else {
	if (payload.ok !== true) throw new Error(`live: usage lookup failed — ${payload.error}`);
	if (payload.plan !== 'go-plus') throw new Error('live: the configured plan must survive normalization');
	if (payload.key === undefined || payload.key.masked === undefined) throw new Error('live: the key must be reported masked');
	if (res.body.includes(refs.OPENCODE_API_KEY)) throw new Error('live: the response body must never carry the full API key');
	if (payload.identity === undefined || typeof payload.identity.email !== 'string') {
		throw new Error('live: the Console budget report should carry the member identity');
	}
	if (!Array.isArray(payload.budgets) || payload.budgets.length === 0) {
		throw new Error('live: the Console budget report should carry at least one member row');
	}

	const windows = payload.usage?.windows ?? {};
	for (const id of ['rolling', 'weekly', 'monthly']) {
		const window = windows[id];
		if (window === undefined) throw new Error(`live: window ${id} missing`);
		if (typeof window.percent !== 'number') throw new Error(`live: window ${id} should carry a numeric percent`);
		if (typeof window.resetsAt !== 'string') throw new Error(`live: window ${id} should carry resetsAt`);
	}

	if (!Array.isArray(payload.models) || payload.models.length < 10) {
		throw new Error(`live: expected a real model catalog, got ${payload.models?.length}`);
	}
	const catalogued = payload.models.filter((model) => model.catalogued === true);
	if (catalogued.length === 0) throw new Error('live: no served model matched the shipped allowance table');
	for (const model of catalogued) {
		if (model.unlimited === true) continue;
		if (typeof model.allowance !== 'number') throw new Error(`live: ${model.id} should carry an allowance`);
		if (typeof model.price?.input !== 'number') throw new Error(`live: ${model.id} should carry a price`);
		if (model.allowance < 0) throw new Error(`live: ${model.id} allowance must not be negative`);
	}

	console.log(
		`live payload ok: identity=${payload.identity.email ?? payload.identity.userId} ` +
			`windows=${Object.entries(windows)
				.map(([id, window]) => `${id}:${window.percent}%`)
				.join(' ')} models=${payload.modelCount} catalogued=${catalogued.length} ` +
			`spend=${payload.spend === undefined ? 'unavailable' : `${payload.spend.source} $${payload.spend.totalCost.toFixed(2)}`}`,
	);
	if (payload.spend !== undefined) {
		if (payload.spend.source === 'usage-export') {
			if (!(payload.spend.totalCost >= 0)) throw new Error('live: usage-export spend must not be negative');
		} else if (payload.spend.source === 'budgets') {
			if (!(payload.spend.totalCost >= 0)) throw new Error('live: budget spend must not be negative');
		} else {
			throw new Error(`live: unexpected spend source ${payload.spend.source}`);
		}
	} else {
		console.log('live note: this key cannot read Console spend data —', payload.errors.budgets);
	}

	const perModel = catalogued.find((model) => model.unlimited !== true && model.usedEstimate !== undefined);
	if (perModel !== undefined) {
		console.log(
			`live estimate sample: ${perModel.id} allowance=$${perModel.allowance} ` +
				`used=$${perModel.usedEstimate.toFixed(2)} remaining=$${perModel.remainingEstimate.toFixed(2)}`,
		);
	}
}

// A non-GET method must be refused without touching the network.
const rejected = makeResponse();
await route.handler({ method: 'POST', url: '/opencode/account' }, rejected);
if (rejected.statusCode !== 405) throw new Error(`expected HTTP 405 for POST, got ${rejected.statusCode}`);
console.log('method guard ok: POST → 405');

console.log('\ntest-host OK');
void here;
