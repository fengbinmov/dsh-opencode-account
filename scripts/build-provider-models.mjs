/**
 * Regenerate the `opencode-go` provider routes written into `cordis.patch.yml`
 * (and mirrored into `$DSH_HOME/settings.yaml`), so the DSH model picker matches
 * the OpenCode Go subscription exactly.
 *
 *   node scripts/build-provider-models.mjs            # rewrite both files
 *   node scripts/build-provider-models.mjs --check    # fail when they are stale
 *   node scripts/build-provider-models.mjs --offline  # reuse the committed list
 *
 * Why this script exists — pi-ai's installed `opencode-go` catalog drifts from
 * the live Go offering. Measured 2026-09-28: it carried 27 models, 8 short of
 * the gateway (so `gpt-6-luna`, `grok-4.7`, `deepseek-v4.1-flash`,
 * `mimo-v2.6-*`, `deepseek-flash` and the two free models could not be selected
 * at all) and 5 stale ids the gateway no longer serves (`glm-5.1`, `kimi-k2.6`,
 * `omen-alpha`, `qwen3.6-plus`, `qwen3.7-max`). A route profile's `models` list
 * REPLACES the installed catalog, so the complete list is declared here.
 *
 * Two constraints shape the output, both read out of dsh-llm-pi-ai's own
 * resolver:
 *
 *   1. A `models` entry has NO `api` field (`modelFields` in its schema), and
 *      `resolveRouteModels` computes `api = request.api ?? base.api ?? routeApi`
 *      — the entry's own `api` never participates. A model the installed
 *      catalog does not describe therefore takes the ROUTE's protocol.
 *   2. One route can only carry one `api`.
 *
 * So a subscription whose models span three wire protocols needs one route per
 * protocol, and every route is a slice of the same gateway catalog.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

/** js-yaml lives in the profile's tree, not in this checkout. */
function loadJsYaml() {
	const candidates = [
		join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh', 'profiles', 'web', 'node_modules', 'js-yaml', 'index.js'),
		join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'js-yaml', 'index.js'),
	];
	for (const candidate of candidates) {
		try {
			const loaded = require(candidate);
			return loaded.default ?? loaded;
		} catch {
			// Try the next candidate.
		}
	}
	throw new Error('js-yaml not found; install the plugin profile first');
}

const jsYaml = loadJsYaml();

function loadYaml(source) {
	return jsYaml.load(source);
}

/** Serialize back to YAML; `lineWidth: -1` keeps long model rows on one line. */
function dumpYaml(value) {
	return jsYaml.dump(value, { lineWidth: -1, noRefs: true, quotingType: '"' });
}

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const check = process.argv.includes('--check');
const offline = process.argv.includes('--offline');

/** The session id the gateway requires; stable, not unique. */
const SESSION = '7f3c1a92-5d84-4e6b-9c07-2ab5e13f8d40';

/**
 * The reasoning level every route defaults to.
 *
 * A route-level `reasoning` makes dsh publish a `defaultEffort`, which removes
 * the picker's "provider default" entry — and that entry is a trap: it and `Off`
 * are byte-identical (both send `thinking:{type:"disabled"}`), so leaving it
 * selected means "ask for thinking off, then rely on the gateway ignoring it"
 * (measured: it does ignore it today). Naming a level makes the default explicit.
 *
 * `high` is chosen because it has the WIDEST support across the Go catalog —
 * 20/22 on `opencode-go`, 6/6 on responses, 2/2 on messages — versus `low` 18/22,
 * `max` 19/22 and `medium` only 11/22. dsh drops the default for a model that
 * cannot take it (`describableReasoningLevel` returns none rather than failing),
 * so the two models without `high` (`kimi-k3`, `qwen3.8-max`) simply keep the
 * "provider default" entry instead of erroring.
 */
const DEFAULT_REASONING = 'high';

/**
 * Route ids, one per wire protocol. The plain `opencode-go` keeps the name the
 * Go docs use for the OpenAI-compatible endpoint, which is what most of the
 * catalog speaks.
 *
 * `baseURL` is load-bearing on every route: `resolveRouteModels` demands one for
 * any model the installed catalog does not describe, and the route's `api`
 * decides which spelling is right —
 *
 *   openai-completions / openai-responses → the OpenAI SDK appends
 *     `/chat/completions` and `/responses`, so the root ends in `/v1`;
 *   anthropic-messages → the Anthropic SDK appends `/v1/messages`, so the root
 *     must STOP at `/zen/go` or the path would double to `/v1/v1/messages`.
 *
 * Both spellings match pi-ai's own catalog `baseUrl` for the same protocols.
 */
const ROUTES = [
	{
		id: 'opencode-go',
		api: 'openai-completions',
		displayName: 'OpenCode Go',
		baseURL: 'https://opencode.ai/zen/go/v1',
		reasoning: DEFAULT_REASONING,
	},
	{
		id: 'opencode-go-responses',
		api: 'openai-responses',
		displayName: 'OpenCode Go (Responses)',
		baseURL: 'https://opencode.ai/zen/go/v1',
		reasoning: DEFAULT_REASONING,
	},
	{
		id: 'opencode-go-messages',
		api: 'anthropic-messages',
		displayName: 'OpenCode Go (Messages)',
		baseURL: 'https://opencode.ai/zen/go',
		reasoning: DEFAULT_REASONING,
	},
];

/**
 * pi-ai's "no thinkingLevelMap" semantics: every level at or below the model's
 * ceiling is offered, and the wire spelling is the level's own name. A valueless
 * key (`null`) means "offered, send no parameter" — only `off` may stay empty.
 * @see https://opencode.ai/docs/go/ — the docs never publish per-model levels.
 */
const ALL_LEVELS = { off: null, minimal: 'minimal', low: 'low', medium: 'medium', high: 'high', max: 'max' };

/** Resolve pi-ai's installed opencode-go catalog, indexed by model id. */
function piAiCatalog() {
	const dshHome = process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh');
	const candidates = [
		join(
			process.env.APPDATA ?? '',
			'npm',
			'node_modules',
			'@deepseek-ai',
			'dsh',
			'node_modules',
			'@earendil-works',
			'pi-ai',
			'dist',
			'providers',
			'data',
			'opencode-go.json',
		),
		join(dshHome, 'profiles', 'node_modules', '@earendil-works', 'pi-ai', 'dist', 'providers', 'data', 'opencode-go.json'),
		join(root, 'node_modules', '@earendil-works', 'pi-ai', 'dist', 'providers', 'data', 'opencode-go.json'),
	];
	for (const candidate of candidates) {
		try {
			const raw = JSON.parse(readFileSync(candidate, 'utf8'));
			const byId = new Map();
			for (const models of Object.values(raw)) {
				for (const [id, model] of Object.entries(models)) byId.set(id, model);
			}
			if (byId.size > 0) return byId;
		} catch {
			// Try the next candidate.
		}
	}
	throw new Error('could not locate pi-ai\'s opencode-go catalog');
}

/**
 * Models pi-ai's installed catalog does not describe, declared in full.
 *
 * These need an entry because the installed catalog is the only other source of
 * a model's `api` — and **no metadata source publishes the wire protocol**
 * (models.dev carries one `npm`/`api` pair per provider, which cannot separate
 * the three endpoints this subscription spans). Everything else here is a
 * fallback for the day models.dev stops listing the model:
 *
 *   `input`  — models.dev normally decides (see `inputFor`); `deepseek-flash` is
 *              the one entry that still relies on this declaration.
 *   `name`, `contextWindow`, `maxTokens` — from the docs' price table and the
 *              family's published window; `window-unverified` marks the window
 *              the docs never printed.
 *
 * `thinkingLevelMap` is what makes the reasoning-effort selector appear at all.
 * pi-ai's `getSupportedThinkingLevels` returns `['off']` for a model whose
 * `reasoning` flag is unset, and an entry the installed catalog does not
 * describe starts with nothing — so leaving this out is exactly why the added
 * models offered no efforts. A non-null value is the wire spelling sent for that
 * level, `null` means "not offered" (only `off` may stay empty), and
 * `xhigh`/`max` are offered only when present.
 *
 * This stays on pi-ai's map rather than models.dev's `reasoning_options`: the
 * two disagree on 5 models and spell "off" differently (`none`), so switching
 * would need a translation layer for no gain — every model already resolves its
 * levels correctly from the map.
 */
const EXTRA_MODELS = {
	'deepseek-flash': {
		api: 'openai-completions',
		name: 'DeepSeek Flash',
		contextWindow: 1000000,
		maxTokens: 131072,
		input: ['text', 'image'],
		// same row shape as deepseek-v4-flash
		thinkingLevelMap: { low: 'low', high: 'high', max: 'max' },
	},
	'deepseek-v4.1-flash': {
		api: 'openai-completions',
		name: 'DeepSeek V4.1 Flash',
		contextWindow: 1000000,
		maxTokens: 131072,
		input: ['text', 'image'],
		thinkingLevelMap: { low: 'low', high: 'high', max: 'max' },
	},
	'gpt-6-luna': {
		api: 'openai-responses',
		name: 'GPT 6 Luna',
		contextWindow: 1050000,
		maxTokens: 128000,
		input: ['text', 'image'],
		// gpt-5.6-luna ships no map either, and pi-ai reads that as every level:
		thinkingLevelMap: ALL_LEVELS,
	},
	'grok-4.7': {
		api: 'openai-responses',
		name: 'Grok 4.7',
		contextWindow: 500000,
		maxTokens: 128000,
		input: ['text', 'image'],
		thinkingLevelMap: ALL_LEVELS,
	},
	'longcat-2.5-preview-free': {
		api: 'openai-completions',
		name: 'LongCat 2.5 Preview Free',
		contextWindow: 1000000,
		maxTokens: 131072,
		input: ['text', 'image'],
		thinkingLevelMap: ALL_LEVELS,
	},
	'mimo-v2.6-flash': {
		api: 'openai-completions',
		name: 'MiMo V2.6 Flash',
		contextWindow: 1000000,
		maxTokens: 128000,
		input: ['text', 'image'],
		thinkingLevelMap: ALL_LEVELS,
	},
	'mimo-v2.6-pro': {
		api: 'openai-completions',
		name: 'MiMo V2.6 Pro',
		contextWindow: 1048576,
		maxTokens: 128000,
		input: ['text', 'image'],
		thinkingLevelMap: ALL_LEVELS,
	},
	'space-bunny-free': {
		api: 'openai-completions',
		name: 'Space Bunny Free',
		contextWindow: 131072,
		maxTokens: 131072,
		input: ['text', 'image'],
		thinkingLevelMap: ALL_LEVELS,
		note: 'window-unverified',
	},
};

/** Read the API key the way the plugin does. */
function readApiKey() {
	const refs = {};
	try {
		const dshHome = process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh');
		const raw = readFileSync(join(dshHome, '.credentials.yaml'), 'utf8');
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
	} catch {
		// Fall through to the environment.
	}
	return process.env.OPENCODE_API_KEY ?? refs.OPENCODE_API_KEY;
}

/** The gateway's live Go model ids, sorted: the subscription's real offering. */
async function gatewayModels() {
	if (offline) return undefined;
	const key = readApiKey();
	if (key === undefined) throw new Error('no OPENCODE_API_KEY available (use --offline to skip the fetch)');
	const res = await fetch('https://opencode.ai/zen/go/v1/models', {
		headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
		signal: AbortSignal.timeout(30000),
	});
	if (!res.ok) throw new Error(`GET /zen/go/v1/models → HTTP ${res.status}`);
	const ids = ((await res.json()).data ?? []).map((model) => model.id).filter((id) => typeof id === 'string');
	if (ids.length === 0) throw new Error('the gateway returned an empty model list');
	return ids.sort();
}

const piAi = piAiCatalog();
const live = await gatewayModels();

/**
 * The model ids one file actually declares, read structurally rather than by
 * regex: a patch file also carries loader-row ids (`llm-pi-ai`,
 * `opencode-account`), so counting every `- id:` would overcount.
 */
function declaredIds(path) {
	let parsed;
	try {
		parsed = loadYaml(readFileSync(path, 'utf8'));
	} catch {
		return [];
	}
	const providers = Array.isArray(parsed)
		? parsed.find((entry) => entry?.id === 'llm-pi-ai')?.config?.providers
		: parsed?.['llm-pi-ai']?.providers;
	if (providers === undefined || providers === null) return [];
	return [
		...new Set(
			Object.values(providers).flatMap((profile) => (profile?.models ?? []).map((model) => model.id)),
		),
	].sort();
}

const patchPath = join(root, 'cordis.patch.yml');
const dshHome = process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh');
const settingsPath = join(dshHome, 'settings.yaml');

const ids = live ?? declaredIds(patchPath);
if (ids.length === 0) throw new Error('no model list available; run once without --offline');

/**
 * Authoritative model metadata, from `scripts/fetch-model-metadata.mjs`
 * (models.dev — the catalog OpenCode's own feature list is built from).
 */
function modelMetadata() {
	try {
		const raw = JSON.parse(readFileSync(join(root, 'model-metadata.json'), 'utf8'));
		if (raw.models === undefined || typeof raw.models !== 'object') return undefined;
		return raw.models;
	} catch {
		return undefined;
	}
}

const METADATA = modelMetadata();
if (METADATA !== undefined) console.log(`  metadata from models.dev: ${Object.keys(METADATA).length} models`);

/** dsh's own `ModelModality` is exactly these two; the catalog lists more. */
const DECLARABLE_MODALITIES = ['text', 'image'];

/**
 * The `input` list one model should carry.
 *
 * models.dev decides. The declared value in {@link EXTRA_MODELS} is only the
 * fallback for a model the catalog does not describe — today just
 * `deepseek-flash`. The catalog's extra modalities (audio / video / pdf) are
 * filtered out because a route profile can only carry text and image; the
 * account page shows them instead.
 *
 * This replaced a live image probe, which could only ever ask about images (it
 * never revealed audio/video/pdf), cost 30 requests per run, and got one model
 * wrong (`longcat-2.5-preview-free`).
 */
function inputFor(id, declared) {
	const catalogued = METADATA?.[id]?.modalities?.input;
	if (Array.isArray(catalogued) && catalogued.length > 0) {
		const declarable = catalogued.filter((modality) => DECLARABLE_MODALITIES.includes(modality));
		// A model whose entry lists nothing declarable keeps the declared text
		// floor rather than resolving to an empty (unserviceable) list.
		if (declarable.length > 0) return declarable;
	}
	return declared;
}

/** One model's resolved facts: the catalog knows it, or EXTRA_MODELS does. */
function facts(id) {
	const base = piAi.get(id);
	if (base !== undefined) {
		return {
			api: base.api,
			name: base.name,
			contextWindow: base.contextWindow,
			maxTokens: base.maxTokens,
			input: inputFor(id, base.input),
			// pi-ai treats a MISSING map as "every level", so spell that out here
			// too: leaving it to inheritance is what silently dropped the selector.
			thinkingLevelMap: base.thinkingLevelMap ?? ALL_LEVELS,
			inherited: true,
		};
	}
	const extra = EXTRA_MODELS[id];
	if (extra === undefined) throw new Error(`no declaration for gateway model "${id}"; add it to EXTRA_MODELS`);
	return { ...extra, input: inputFor(id, extra.input), inherited: false };
}

const resolved = new Map(ids.map((id) => [id, facts(id)]));

/**
 * Protocol corrections, measured against the gateway.
 *
 * The protocol comes from the ROUTE, so a model filed on the wrong one is
 * simply unusable. Nothing publishes it as metadata — models.dev carries one
 * `npm`/`api` pair per provider, which cannot separate the three endpoints this
 * subscription spans — so the declared entry is the only other source, and
 * pi-ai's catalog is occasionally stale about it.
 *
 * `scripts/probe-protocol.mjs` re-checks every model against the gateway and
 * prints any divergence; a confirmed one gets an entry here. Kept as code rather
 * than a generated file because the useful content is this short list of
 * exceptions — the probe's full 24-row output was 23 rows of "agrees with the
 * declaration" and one correction, which is a constant, not an artifact.
 */
const PROTOCOL_FIXES = new Map([
	// pi-ai says openai-completions; the gateway answers `400
	// ModelProtocolUnsupported` there and serves it on messages.
	['minimax-m2.7', 'anthropic-messages'],
]);

/** The protocol to serve one model on: the measured correction beats the guess. */
function protocolFor(id) {
	return PROTOCOL_FIXES.get(id) ?? resolved.get(id).api;
}

const unknownProtocols = [...new Set(ids.map(protocolFor))].filter(
	(api) => !ROUTES.some((route) => route.api === api),
);
if (unknownProtocols.length > 0) {
	throw new Error(`models resolved onto protocols with no route: ${unknownProtocols.join(', ')}`);
}

for (const [id, api] of PROTOCOL_FIXES) {
	const declared = resolved.get(id)?.api;
	if (declared !== undefined && declared !== api) console.log(`  protocol corrected: ${id} ${declared} → ${api}`);
}

/** Group the catalog by protocol; every route is one protocol's slice. */
const grouped = ROUTES.map((route) => ({
	...route,
	models: ids.filter((id) => protocolFor(id) === route.api),
}));
const ungrouped = ids.filter((id) => !ROUTES.some((route) => route.api === protocolFor(id)));
if (ungrouped.length > 0) throw new Error(`models on no configured protocol: ${ungrouped.join(', ')}`);
if (grouped.some((route) => route.models.length === 0)) {
	throw new Error(`a route resolved no models: ${grouped.map((route) => `${route.id}=${route.models.length}`).join(' ')}`);
}

/** Serialize one model entry at the given indent, spelling out every fact. */
function modelYaml(id, indent) {
	const fact = resolved.get(id);
	const pad = ' '.repeat(indent);
	const lines = [
		`${pad}- id: ${id}`,
		`${pad}  name: ${fact.name}`,
		`${pad}  contextWindow: ${fact.contextWindow}`,
		`${pad}  maxTokens: ${fact.maxTokens}`,
		`${pad}  input: [${fact.input.map((value) => `'${value}'`).join(', ')}]`,
	];
	lines.push(...reasoningYaml(fact.thinkingLevelMap, indent + 2));
	return lines.join('\n');
}

/**
 * One model's `reasoningEfforts` block, or nothing when it offers no level.
 *
 * Two different meanings of "no value" meet here, and conflating them is what
 * made the first attempt fail:
 *
 *   pi-ai's `thinkingLevelMap[level] === null` means the level is NOT supported
 *     (`getSupportedThinkingLevels` filters those out);
 *   dsh's `reasoningEfforts` treats a valueless key as "supported, send nothing"
 *     and refuses it for every level except `off`.
 *
 * So a null level is DROPPED from the output rather than written as a valueless
 * key, while `off` is always emitted — pi-ai still reports `off` for a map that
 * omits it (its level list starts at `off`), and it is the one spelling dsh
 * allows to stay empty.
 */
function reasoningYaml(map, indent) {
	if (map === undefined) return [];
	const pad = ' '.repeat(indent);
	const offered = Object.entries(map).filter(([, wire]) => wire !== undefined && wire !== null);
	if (offered.length === 0) return [];
	const entries = offered.some(([level]) => level === 'off') ? offered : [['off', null], ...offered];
	return [
		`${pad}reasoningEfforts:`,
		...entries.map(([level, wire]) => (wire === null ? `${pad}  ${level}:` : `${pad}  ${level}: ${wire}`)),
	];
}

/**
 * Every model must come out with at least one level beyond `off`, because that
 * is precisely the condition for the reasoning-effort selector to render. A
 * silent regression here is invisible in a config diff but removes the control
 * from every model, so it is checked before anything is written.
 */
function assertReasoningPresent() {
	const missing = [...resolved.entries()]
		.filter(([, fact]) => reasoningYaml(fact.thinkingLevelMap, 0).length === 0)
		.map(([id]) => id);
	if (missing.length > 0) {
		throw new Error(`models that would offer no reasoning level: ${missing.join(', ')}`);
	}
}

/**
 * The account page (`lib/catalog.js`) names the route a model belongs to, and it
 * keeps its own table for that. Nothing links the two, so a route id renamed
 * here would quietly make the page label every model wrong — check the pairing
 * before writing.
 */
async function assertPageRoutesAgree() {
	const catalog = await import(new URL('../lib/catalog.js', import.meta.url).href);
	for (const route of grouped) {
		const entry = Object.values(catalog.ROUTES).find((candidate) => candidate.id === route.id);
		if (entry === undefined) {
			throw new Error(`lib/catalog.js has no ROUTES entry for route "${route.id}"`);
		}
		if (entry.label !== route.displayName) {
			throw new Error(
				`route "${route.id}" is labelled "${route.displayName}" in the config but "${entry.label}" on the account page`,
			);
		}
	}
	const wrong = [...resolved.keys()].filter((id) => catalog.routeFor(id)?.id !== grouped.find((route) => route.models.includes(id))?.id);
	if (wrong.length > 0) {
		throw new Error(`lib/catalog.js maps these models to the wrong route: ${wrong.join(', ')}`);
	}
}

/** Every fact is spelled out, so nothing depends on catalog inheritance. */
function routeYaml(route, indent) {
	const pad = ' '.repeat(indent);
	return [
		`${pad}${route.id}:`,
		`${pad}  displayName: ${route.displayName}`,
		`${pad}  api: ${route.api}`,
		`${pad}  baseURL: ${route.baseURL}`,
		`${pad}  apiKeyEnv: OPENCODE_API_KEY`,
		// The route's default effort: it removes the picker's "provider default"
		// entry on every model that supports the level (see DEFAULT_REASONING).
		`${pad}  reasoning: ${route.reasoning}`,
		`${pad}  headers:`,
		`${pad}    x-opencode-session: ${SESSION}`,
		`${pad}  models:`,
		...route.models.map((id) => modelYaml(id, indent + 2)),
	].join('\n');
}

/**
 * A route default nothing can take would be dead configuration (and pointless
 * noise in the file), so at least one model per route must offer it.
 *
 * "Offers it" means the map's VALUE is a wire spelling: pi-ai writes `null` for
 * a level a model does NOT support, so counting keys would report levels the
 * generated `reasoningEfforts` has already dropped.
 */
function assertDefaultReasoningUsable() {
	for (const route of grouped) {
		const supported = (id) => {
			const wire = (resolved.get(id).thinkingLevelMap ?? {})[route.reasoning];
			return wire !== undefined && wire !== null;
		};
		const takers = route.models.filter(supported);
		if (takers.length === 0) {
			throw new Error(`route "${route.id}" defaults to "${route.reasoning}", which no model on it supports`);
		}
		const skipped = route.models.filter((id) => !supported(id));
		console.log(
			`  ${route.id.padEnd(24)} default=${route.reasoning}: ${takers.length}/${route.models.length} models` +
				(skipped.length > 0 ? ` (keeps provider-default: ${skipped.join(', ')})` : ''),
		);
	}
}

assertReasoningPresent();
assertDefaultReasoningUsable();
await assertPageRoutesAgree();

const routeBlocks = grouped.map((route) => routeYaml(route, 6)).join('\n');
const generatedBlock = [
	'      # >>> generated by scripts/build-provider-models.mjs — do not hand-edit',
	routeBlocks,
	'      # <<< generated',
].join('\n');
const source = readFileSync(patchPath, 'utf8');
const marker = / {6}# >>> generated[^\n]*\n(?:.*\n)*? {6}# <<< generated/;
if (!marker.test(source)) throw new Error('could not find the generated block in cordis.patch.yml');
const next = source.replace(marker, generatedBlock);

const settingsBlock = ['llm-pi-ai:', '  providers:', ...generatedBlock.split('\n').map((line) => (line.length === 0 ? line : `  ${line}`))].join(
	'\n',
);

/**
 * Merge the OpenCode Go routes into `$DSH_HOME/settings.yaml`.
 *
 * This document wins over the plugin's bundle layer, so the routes have to be
 * stated here too or a Models-page save (which writes here) would drop them.
 *
 * It MERGES rather than replaces. The first version threw away everything from
 * `llm-pi-ai:` to the next top-level key — which on anyone else's machine means
 * deleting the providers they already configured (this is a plugin other people
 * install, not a private one). Now only the three route keys this plugin owns
 * are written; every other provider, and the rest of the document, is preserved
 * verbatim.
 */
function syncSettings() {
	let current;
	try {
		current = readFileSync(settingsPath, 'utf8');
	} catch {
		console.log(`note: ${settingsPath} not found — skipping the settings sync`);
		return;
	}
	const lines = current.split('\n');
	const start = lines.findIndex((line) => line === 'llm-pi-ai:');

	// The section runs to the next top-level key (or EOF).
	let end = lines.length;
	if (start !== -1) {
		for (let index = start + 1; index < lines.length; index += 1) {
			const line = lines[index];
			if (line.trim().length > 0 && !/^\s/.test(line)) {
				end = index;
				break;
			}
		}
	}

	const head = (start === -1 ? lines : lines.slice(0, start)).join('\n').replace(/\s*$/, '');
	const tail = start === -1 ? '' : lines.slice(end).join('\n').replace(/^\s*\n/, '').replace(/\s*$/, '');

	// Providers already configured here, minus the ones this plugin owns.
	const existingSection = start === -1 ? undefined : loadYaml(lines.slice(start, end).join('\n'));
	const existingProviders = existingSection?.['llm-pi-ai']?.providers ?? {};
	const mine = loadYaml(settingsBlock)['llm-pi-ai'].providers;
	const kept = Object.fromEntries(Object.entries(existingProviders).filter(([key]) => !(key in mine)));
	if (Object.keys(kept).length > 0) {
		console.log(`  keeping ${Object.keys(kept).length} unrelated provider(s): ${Object.keys(kept).join(', ')}`);
	}

	const merged = {
		...(existingSection?.['llm-pi-ai'] ?? {}),
		providers: { ...kept, ...mine },
	};
	const block = dumpYaml({ 'llm-pi-ai': merged });
	const updated =
		`${head}\n\n# OpenCode Go routes (dsh-opencode-account). Stated here as well as in the\n` +
		`# plugin bundle layer because a Models-page save rewrites THIS document.\n` +
		`# Regenerate with: node scripts/build-provider-models.mjs\n${block}${tail === '' ? '' : `\n${tail}\n`}`;
	if (updated === current) return;
	writeFileSync(settingsPath, updated);
	console.log(`updated ${settingsPath}`);
}

if (check) {
	/**
	 * Compare the WRITTEN block, not just the id list.
	 *
	 * An id-only check cannot see the fields that actually decide behaviour:
	 * `input` (whether the composer offers attachments), the route's `api` and
	 * `baseURL`, `reasoning` (the default effort). All of those are derived from
	 * models.dev and the probes, so a catalog refresh changes them WITHOUT
	 * changing a single id — and an id-only check would report "in sync" while
	 * the plugin still described the previous capabilities.
	 */
	const actualBlock = marker.exec(source)?.[0];
	const blockStale = actualBlock !== generatedBlock;
	const declared = declaredIds(patchPath);
	const settingsDeclared = declaredIds(settingsPath);
	const same =
		declared.length === ids.length &&
		declared.every((id, index) => id === ids[index]) &&
		settingsDeclared.length === ids.length &&
		settingsDeclared.every((id, index) => id === ids[index]);
	if (blockStale || !same) {
		if (blockStale) {
			const actualInputs = new Map(
				[...(actualBlock ?? '').matchAll(/- id: (\S+)\n(?:.*\n)*?\s+input: \[([^\]]*)\]/g)].map((m) => [
					m[1],
					m[2].replace(/'/g, '').trim(),
				]),
			);
			const changed = ids.filter((id) => actualInputs.get(id) !== (resolved.get(id).input ?? []).join(', '));
			console.error(
				changed.length > 0
					? `the written model block is stale; capabilities changed for: ${changed.join(', ')}`
					: 'the written model block is stale (routes, reasoning default or metadata changed)',
			);
		}
		if (!same) {
			console.error(
				`declared patch=${declared.length} settings=${settingsDeclared.length}, gateway serves ${ids.length}`,
			);
		}
		console.error('run: node scripts/build-provider-models.mjs');
		process.exit(1);
	}
	console.log(`provider catalog matches the gateway (${ids.length} models over ${grouped.length} routes)`);
} else {
	writeFileSync(patchPath, next);
	syncSettings();
	console.log(`wrote ${ids.length} models over ${grouped.length} routes to cordis.patch.yml`);
}

for (const route of grouped) console.log(`  ${route.id.padEnd(24)} ${route.api.padEnd(19)} ${route.models.length} models`);
console.log(`  pi-ai knew ${ids.filter((id) => resolved.get(id).inherited).length}, spelled out in full ${ids.filter((id) => !resolved.get(id).inherited).length}`);
