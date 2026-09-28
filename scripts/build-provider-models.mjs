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
function loadYaml(source) {
	const candidates = [
		join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh', 'profiles', 'web', 'node_modules', 'js-yaml', 'index.js'),
		join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'js-yaml', 'index.js'),
	];
	for (const candidate of candidates) {
		try {
			const loaded = require(candidate);
			return (loaded.default ?? loaded).load(source);
		} catch {
			// Try the next candidate.
		}
	}
	throw new Error('js-yaml not found; install the plugin profile first');
}

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const check = process.argv.includes('--check');
const offline = process.argv.includes('--offline');

/** The session id the gateway requires; stable, not unique. */
const SESSION = '7f3c1a92-5d84-4e6b-9c07-2ab5e13f8d40';

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
	},
	{
		id: 'opencode-go-responses',
		api: 'openai-responses',
		displayName: 'OpenCode Go (Responses)',
		baseURL: 'https://opencode.ai/zen/go/v1',
	},
	{
		id: 'opencode-go-messages',
		api: 'anthropic-messages',
		displayName: 'OpenCode Go (Messages)',
		baseURL: 'https://opencode.ai/zen/go',
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
 * Gateway models pi-ai does not describe, with the facts the docs publish for
 * them: the endpoint table gives the protocol, the price table gives the name.
 * `input` follows the pi-ai rows of the same family, `maxTokens` caps at 128K
 * (the gateway's out-of-catalog ceiling), and `contextWindow` is the family's
 * published window — `window-unverified` marks the one the docs never printed.
 *
 * `thinkingLevelMap` is what makes the reasoning-effort selector appear at all.
 * pi-ai's `getSupportedThinkingLevels` returns `['off']` for any model whose
 * `reasoning` flag is unset, and an entry the installed catalog does not
 * describe starts with nothing — so leaving this out is exactly why the new
 * models offer no efforts. Each map follows the family's catalog row: a
 * non-null value is the wire spelling sent for that level, `null` means the
 * level is not offered (only `off` may stay empty), and `xhigh`/`max` are
 * offered only when present here.
 */
const EXTRA_MODELS = {
	'deepseek-flash': {
		api: 'openai-completions',
		name: 'DeepSeek Flash',
		contextWindow: 1000000,
		maxTokens: 131072,
		input: ['text'],
		// same row shape as deepseek-v4-flash
		thinkingLevelMap: { low: 'low', high: 'high', max: 'max' },
	},
	'deepseek-v4.1-flash': {
		api: 'openai-completions',
		name: 'DeepSeek V4.1 Flash',
		contextWindow: 1000000,
		maxTokens: 131072,
		input: ['text'],
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
		input: ['text'],
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
		input: ['text'],
		thinkingLevelMap: ALL_LEVELS,
	},
	'space-bunny-free': {
		api: 'openai-completions',
		name: 'Space Bunny Free',
		contextWindow: 131072,
		maxTokens: 131072,
		input: ['text'],
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

/** One model's resolved facts: the catalog knows it, or EXTRA_MODELS does. */
function facts(id) {
	const base = piAi.get(id);
	if (base !== undefined) {
		return {
			api: base.api,
			name: base.name,
			contextWindow: base.contextWindow,
			maxTokens: base.maxTokens,
			input: base.input,
			// pi-ai treats a MISSING map as "every level", so spell that out here
			// too: leaving it to inheritance is what silently dropped the selector.
			thinkingLevelMap: base.thinkingLevelMap ?? ALL_LEVELS,
			inherited: true,
		};
	}
	const extra = EXTRA_MODELS[id];
	if (extra === undefined) throw new Error(`no declaration for gateway model "${id}"; add it to EXTRA_MODELS`);
	return { ...extra, inherited: false };
}

const resolved = new Map(ids.map((id) => [id, facts(id)]));

/** Group the catalog by protocol; every route is one protocol's slice. */
const grouped = ROUTES.map((route) => ({
	...route,
	models: ids.filter((id) => resolved.get(id).api === route.api),
}));
const ungrouped = ids.filter((id) => !ROUTES.some((route) => route.api === resolved.get(id).api));
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

/** Every fact is spelled out, so nothing depends on catalog inheritance. */
function routeYaml(route, indent) {
	const pad = ' '.repeat(indent);
	return [
		`${pad}${route.id}:`,
		`${pad}  displayName: ${route.displayName}`,
		`${pad}  api: ${route.api}`,
		`${pad}  baseURL: ${route.baseURL}`,
		`${pad}  apiKeyEnv: OPENCODE_API_KEY`,
		`${pad}  headers:`,
		`${pad}    x-opencode-session: ${SESSION}`,
		`${pad}  models:`,
		...route.models.map((id) => modelYaml(id, indent + 2)),
	].join('\n');
}

assertReasoningPresent();

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
	const head = (start === -1 ? lines : lines.slice(0, start)).join('\n').replace(/\s*$/, '');
	const updated =
		`${head}\n\n# OpenCode Go routes (dsh-opencode-account). Stated here as well as in the\n` +
		`# plugin bundle layer because a Models-page save rewrites THIS document.\n${settingsBlock}\n`;
	if (updated === current) return;
	writeFileSync(settingsPath, updated);
	console.log(`updated ${settingsPath}`);
}

if (check) {
	const declared = declaredIds(patchPath);
	const settingsDeclared = declaredIds(settingsPath);
	const same =
		declared.length === ids.length &&
		declared.every((id, index) => id === ids[index]) &&
		settingsDeclared.length === ids.length &&
		settingsDeclared.every((id, index) => id === ids[index]);
	if (!same) {
		console.error(
			`declared patch=${declared.length} settings=${settingsDeclared.length}, gateway serves ${ids.length}`,
		);
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
