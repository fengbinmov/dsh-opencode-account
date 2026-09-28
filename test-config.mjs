// Verify that the GENERATED provider config actually loads in dsh.
//
//   node test-config.mjs
//
// Why this exists: the generator can emit a config that looks right and that
// dsh still refuses — a model missing a field, a model filed on a protocol its
// route does not speak, a route left with no models. Each of those was found by
// hand during development (twice: the missing `baseURL`, and `minimax-m2.7` on
// the wrong protocol), and a hand check is not a regression test: the next
// generator change would only surface at the user's next dsh restart.
//
// It drives dsh's OWN plugin (`dsh-llm-pi-ai`) over the shipped
// `cordis.patch.yml`, so the assertion is "dsh accepts this", not "this parses".
// No network: the config is read from disk and the adapter is only asked to
// resolve metadata.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/**
 * Where dsh's own modules live. Windows' npm prefix was the original single
 * shape; a dsh profile's hoisted `node_modules` and the Homebrew/system npm
 * prefixes hold the same packages on macOS and Linux. `DSH_NODE_MODULES`
 * overrides the search when a machine keeps them elsewhere.
 */
function dshModuleRoots() {
	const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
	const appData = process.env.APPDATA ?? '';
	return [
		process.env.DSH_NODE_MODULES,
		home === '' ? undefined : join(home, '.dsh', 'profiles', 'node_modules'),
		home === '' ? undefined : join(home, '.dsh', 'profiles', 'web', 'node_modules'),
		appData === '' ? undefined : join(appData, 'npm', 'node_modules'),
		appData === '' ? undefined : join(appData, 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules'),
		'/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/node_modules',
		'/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules',
	].filter((root) => root !== undefined && root !== '');
}

/** js-yaml ships in the dsh profile; nothing in this repo depends on it. */
function loadYaml(source) {
	for (const root of dshModuleRoots()) {
		try {
			const loaded = require(join(root, 'js-yaml', 'index.js'));
			return (loaded.default ?? loaded).load(source);
		} catch {
			// next root
		}
	}
	throw new Error('js-yaml not found; install the plugin into a dsh profile first');
}

/** dsh's own pi-ai adapter, from wherever dsh is installed. */
async function loadPlugin() {
	for (const root of dshModuleRoots()) {
		try {
			return await import(pathToFileURL(join(root, '@deepseek-ai', 'dsh-llm-pi-ai', 'lib', 'index.js')).href);
		} catch {
			// next root
		}
	}
	return undefined;
}

const plugin = await loadPlugin();
if (plugin === undefined) {
	console.log('skipped: dsh-llm-pi-ai not found (install the plugin into a profile first)');
	process.exit(0);
}

/** The provider section out of the shipped bundle layer. */
const patch = loadYaml(readFileSync(join(here, 'cordis.patch.yml'), 'utf8'));
const entry = Array.isArray(patch) ? patch.find((row) => row?.id === 'llm-pi-ai') : undefined;
const section = entry?.config;
if (section?.providers === undefined) throw new Error('cordis.patch.yml declares no llm-pi-ai providers');
const routes = Object.keys(section.providers);
console.log(`routes in cordis.patch.yml: ${routes.join(', ')}`);

// `apply()` receives what dsh's loader hands it: the config validated through
// the plugin's own schema (each node a Schema with `.get()`), plus the fiber
// that names the settings namespace. The raw YAML object above stays the source
// of the assertions; it is not a valid plugin input on its own.
const validated = plugin.Config['~standard'].validate(section);
if (validated.issues !== undefined) {
	throw new Error(`dsh rejects the shipped config: ${JSON.stringify(validated.issues)}`);
}

/** Capture the adapter the plugin registers, by driving its real `apply()`. */
let adapter;
let directory;
plugin.apply(
	{
		fiber: { entry: { options: { id: 'llm-pi-ai' } } },
		llm: {
			registerConfigurableProviders: (rows) => {
				directory = rows;
				return { replace() {}, dispose() {} };
			},
			registerModelDiscovery: () => {},
			registerAdapter: (_routes, instance) => {
				adapter = instance;
				return { replace() {}, dispose() {} };
			},
		},
		logger: { warn() {}, info() {}, error() {}, debug() {} },
		get: () => undefined,
		on: () => {},
		effect: () => {},
		inject: (names, callback) => {
			if (!names.includes('settings')) return;
			callback({ settings: { configure: () => {}, installSection: () => {} }, effect: () => {} });
		},
	},
	validated.value,
);
if (adapter === undefined) throw new Error('the plugin registered no adapter — dsh would serve no route');

// The provider rows the Models page renders. They must come from this config
// alone: that is what makes the plugin usable on a machine that never edited
// settings.yaml — install it, set the API key, and the routes are there.
const configuredRoutes = Object.keys(section.providers);
const rows = (directory ?? []).filter((row) => configuredRoutes.includes(row.provider));
console.log(`models-page rows from this config: ${rows.length}`);
for (const row of rows) {
	console.log(`  ${row.provider.padEnd(24)} "${row.displayName}"`);
}
if (rows.length !== configuredRoutes.length) {
	const listed = new Set(rows.map((row) => row.provider));
	throw new Error(`routes missing from the Models page: ${configuredRoutes.filter((r) => !listed.has(r)).join(', ')}`);
}
for (const row of rows) {
	if (typeof row.displayName !== 'string' || row.displayName.length === 0) {
		throw new Error(`${row.provider}: the Models row has no display name`);
	}
	if ((row.settingsPath ?? []).join('.') !== `providers.${row.provider}`) {
		throw new Error(`${row.provider}: unexpected settings path ${(row.settingsPath ?? []).join('.')}`);
	}
}

const declared = Object.entries(section.providers).flatMap(([route, profile]) =>
	(profile.models ?? []).map((model) => ({ route, id: model.id, input: model.input })),
);
console.log(`models declared: ${declared.length}`);

// 1. Every declared model must resolve, with modalities and reasoning metadata.
//    `resolveModel` is the exact call the Models page and the picker make.
const failures = [];
let withReasoning = 0;
let withImage = 0;
for (const { route, id, input } of declared) {
	if (!Array.isArray(input) || input.length === 0) failures.push(`${id}: declares no input modality`);
	try {
		const info = await adapter.resolveModel(route, id);
		if (info?.id !== id) failures.push(`${id}: resolved to "${info?.id}"`);
		if ((info?.inputModalities ?? []).length === 0) failures.push(`${id}: resolved with no modalities`);
		if ((info?.inputModalities ?? []).includes('image')) withImage += 1;
		if ((info?.reasoning?.efforts ?? []).length > 1) withReasoning += 1;
	} catch (error) {
		failures.push(`${id} (${route}): ${error instanceof Error ? error.message : String(error)}`);
	}
}
if (failures.length > 0) {
	console.error('\ndsh would refuse these models:');
	for (const failure of failures) console.error(`  ${failure}`);
	process.exit(1);
}

// 2. The measured protocol corrections must actually have taken effect: a model
//    on the wrong route is unusable, and `minimax-m2.7` is the one that was.
const messagesRoute = Object.entries(section.providers).find(([, profile]) => profile.api === 'anthropic-messages');
if (messagesRoute === undefined) throw new Error('no anthropic-messages route is configured');
const onMessages = (messagesRoute[1].models ?? []).map((model) => model.id);
for (const id of ['minimax-m2.7', 'minimax-m3', 'qwen3.8-flash']) {
	if (!onMessages.includes(id)) throw new Error(`${id} should be served by the messages route, got: ${onMessages.join(', ')}`);
}

// 3. Reasoning metadata must survive: without it the picker loses the control
//    entirely, which is a silent failure rather than an error.
if (withReasoning !== declared.length) {
	throw new Error(`only ${withReasoning}/${declared.length} models expose reasoning efforts`);
}

console.log(`  resolved: ${declared.length}/${declared.length}`);
console.log(`  with reasoning efforts: ${withReasoning}`);
console.log(`  accepting images: ${withImage}`);
console.log(`  messages route: ${onMessages.join(', ')}`);
console.log('\ntest-config OK — dsh accepts every declared model');
