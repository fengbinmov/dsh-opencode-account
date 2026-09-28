// Offline render harness for the client half: load lib/client.js through a fake
// __ModuleLoader__, register into a fake slots context, then walk the element
// tree the page component returns.
//
//   node test-client.mjs
//
// Covers: loading, ready (both plans), a burned window, a missing key, an
// upstream failure, a permission-denied spend card, a failed model catalog, and
// the English surface.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

let captured;
globalThis.window = {
	__ModuleLoader__: {
		load: (spec) => {
			captured = spec;
		},
	},
	setInterval: () => 0,
	clearInterval: () => {},
	setTimeout: (fn) => {
		fn();
		return 0;
	},
};
// Minimal DOM: the page injects its stylesheet through a `data-plugin-css`
// guard, so the stub has to keep a real element table (and prove idempotence).
const injectedStyles = new Map();
globalThis.document = {
	documentElement: { lang: 'zh-CN' },
	querySelector: (selector) => {
		const match = /\[data-plugin-css="(.+)"\]/.exec(selector);
		return match && injectedStyles.has(match[1]) ? injectedStyles.get(match[1]) : null;
	},
	createElement: () => ({ dataset: {}, textContent: '' }),
	head: {
		appendChild: (tag) => {
			injectedStyles.set(tag.dataset.pluginCss, tag);
		},
	},
};

const source = readFileSync(join(here, 'lib/client.js'), 'utf8');
// eslint-disable-next-line no-eval
eval(source);
if (captured === undefined) throw new Error('client bundle did not call __ModuleLoader__.load');
if (captured.id !== 'dsh-opencode-account') {
	throw new Error(`module id must equal the package name, got ${captured.id}`);
}
console.log('module id:', captured.id);

let stateIndex = 0;
let presetStates = [];
/** Persistent hook slots: `useRef` must survive a re-render, like the real one. */
let refSlots = new Map();

const reactStub = {
	createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
	useState: (initial) => {
		// Presets are a positional queue: every hook call in a render maps to one
		// entry, extra calls fall back to the component's own initial value.
		stateIndex += 1;
		if (stateIndex <= presetStates.length) return [presetStates[stateIndex - 1], () => {}];
		return [typeof initial === 'function' ? initial() : initial, () => {}];
	},
	useEffect: () => {},
	useCallback: (fn) => fn,
	useMemo: (fn) => fn(),
	useRef: (initial) => {
		const slot = stateIndex;
		stateIndex += 1;
		if (!refSlots.has(slot)) refSlots.set(slot, { current: initial });
		return refSlots.get(slot);
	},
};

const mod = captured.factory((name) => {
	if (name === 'react') return reactStub;
	throw new Error(`unexpected require: ${name}`);
});
console.log('exports:', Object.keys(mod).join(','), '| inject:', JSON.stringify(mod.inject));

let registration;
const ctx = {
	slots: {
		inject: (slot, factory) => {
			console.log('slots.inject:', slot);
			factory();
		},
		register: (spec, component) => {
			registration = { spec, component };
			return () => {};
		},
	},
};
mod.apply(ctx);
if (injectedStyles.size !== 1) throw new Error(`expected exactly one injected stylesheet, got ${injectedStyles.size}`);
mod.apply(ctx);
if (injectedStyles.size !== 1) throw new Error('stylesheet injection is not idempotent');
console.log('stylesheet id:', [...injectedStyles.keys()][0]);
console.log(
	'registered slot:',
	registration.spec.name,
	'| id:',
	registration.spec.id,
	'| label:',
	registration.spec.label(),
	'| order:',
	registration.spec.order,
);

function flatten(node, out = []) {
	if (node === null || node === undefined || node === false || node === true) return out;
	if (typeof node === 'string' || typeof node === 'number') {
		out.push(String(node));
		return out;
	}
	if (Array.isArray(node)) {
		for (const child of node) flatten(child, out);
		return out;
	}
	if (typeof node === 'object') {
		if (typeof node.type === 'function') {
			const elementProps = { ...node.props };
			if (node.children && node.children.length > 0) {
				elementProps.children = node.children.length === 1 ? node.children[0] : node.children;
			}
			return flatten(node.type(elementProps), out);
		}
		for (const child of node.children ?? []) flatten(child, out);
	}
	return out;
}

/**
 * Collect every props object in the tree: each component element's own props
 * plus everything its render output produces (so tests reach event handlers,
 * `data-*` markers and DOM attributes alike).
 */
function props(node, out = []) {
	if (node === null || node === undefined || typeof node !== 'object') return out;
	if (Array.isArray(node)) {
		for (const child of node) props(child, out);
		return out;
	}
	const own = node.props ?? {};
	out.push(own);
	if (typeof node.type === 'function') {
		const next = { ...own };
		if (node.children && node.children.length > 0) {
			next.children = node.children.length === 1 ? node.children[0] : node.children;
		}
		return props(node.type(next), out);
	}
	for (const child of node.children ?? []) props(child, out);
	return out;
}

const quotaWindows = [
	{ id: 'rolling', label: '5-hour', shareOfMonthly: 0.2 },
	{ id: 'weekly', label: 'Weekly', shareOfMonthly: 0.5 },
	{ id: 'monthly', label: 'Monthly', shareOfMonthly: 1 },
];

const readyData = {
	ok: true,
	fetchedAt: '2026-09-28T14:01:20.000Z',
	keySource: 'credential:OPENCODE_API_KEY',
	key: { masked: 'oc_sk_fe2a0…', length: 55, prefix: 'oc_sk_' },
	baseURL: 'https://opencode.ai/zen/go/v1',
	consoleURL: 'https://opencode.ai/console',
	dashboardURL: 'https://opencode.ai/console',
	provider: 'opencode-go',
	plan: 'go-plus',
	planFromApi: true,
	plans: [
		{ id: 'go', name: 'Go', pricePerMonth: 10 },
		{ id: 'go-plus', name: 'Go Plus', pricePerMonth: 40 },
	],
	quotaWindows,
	usageRange: '30d',
	session: '00000000-0000-4000-8000-000000000000',
	identity: { userId: 'user_01M3M2YA0HP2EQF30T75AZ7G0P', email: 'user@example.com' },
	usage: {
		windows: {
			rolling: { status: 'ok', percent: 0.705, used: 0.338495, limit: 48, resetsAt: '2026-09-28T19:42:15.917Z' },
			weekly: { status: 'ok', percent: 0.282, used: 0.338495, limit: 120, resetsAt: '2026-10-05T00:00:00.000Z' },
			monthly: { status: 'ok', percent: 0.141, used: 0.338495, limit: 240, resetsAt: '2026-10-28T13:36:37.000Z' },
		},
	},
	models: [
		{
			id: 'deepseek-v4-flash',
			name: 'DeepSeek V4 Flash',
			allowance: 60,
			catalogued: true,
			price: { input: 0.15, output: 0.6, cacheRead: 0.003 },
			peak: { input: 0.3, output: 1.2, cacheRead: 0.006 },
			note: 'peak',
			route: { id: 'opencode-go', label: 'OpenCode Go' },
			used: 0.1083,
			remaining: 59.89,
		},
		{
			id: 'gpt-6-luna',
			name: 'GPT 6 Luna',
			allowance: 15,
			catalogued: true,
			price: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
			route: { id: 'opencode-go-responses', label: 'OpenCode Go (Responses)' },
			used: 0.0024,
			remaining: 14.9976,
		},
		{
			id: 'space-bunny-free',
			name: 'Space Bunny Free',
			allowance: undefined,
			unlimited: true,
			catalogued: true,
			price: { input: 0, output: 0, cacheRead: 0 },
			route: { id: 'opencode-go', label: 'OpenCode Go' },
		},
		{ id: 'unknown-new-model', catalogued: false, route: { id: 'opencode-go', label: 'OpenCode Go' } },
	],
	modelCount: 4,
	budgets: [
		{
			userId: 'user_01M3M2YA0HP2EQF30T75AZ7G0P',
			email: 'user@example.com',
			limit: undefined,
			spent: 0,
			capped: false,
			exceeded: false,
			resetsAt: '2026-10-01T00:00:00.000Z',
		},
	],
	balance: null,
	spend: {
		source: 'usage-export',
		totalCost: 3.42,
		totalRequests: 128,
		rowCount: 26,
		days: [],
		topModels: [
			{ model: 'deepseek-v4-flash', cost: 2.5, requests: 90, input: 100, output: 20, cacheRead: 0 },
			{ model: 'glm-5.3', cost: 0.92, requests: 38, input: 40, output: 10, cacheRead: 0 },
		],
		modelCount: 2,
	},
	errors: {},
};

const burnedData = {
	...readyData,
	usage: {
		windows: {
			rolling: { status: 'rate-limited', percent: 100, used: 48, limit: 48, resetsAt: '2026-09-28T15:30:00.000Z' },
			weekly: { status: 'ok', percent: 72.5, used: 87, limit: 120, resetsAt: '2026-10-05T00:00:00.000Z' },
			monthly: { status: 'ok', percent: 42, used: 100.8, limit: 240, resetsAt: '2026-10-28T13:36:37.000Z' },
		},
	},
	models: readyData.models.map((model) =>
		model.id === 'deepseek-v4-flash' ? { ...model, used: 25.2, remaining: 34.8 } : model,
	),
};

const noSpendData = {
	...readyData,
	spend: undefined,
	budgets: [],
	errors: {
		usageExport: '/api/v1/usage/export?scope=member&range=30d → HTTP 403: Forbidden',
		budgets: '/api/v1/budgets/members → HTTP 403: Forbidden',
	},
};

const modelsFailedData = {
	...readyData,
	models: [],
	modelCount: 0,
	errors: { models: '/models → HTTP 500: boom' },
};

/** Mirrors the page's shipped field defaults, so the staged form starts clean. */
const FIELD_DEFAULTS = {
	plan: '',
	baseURL: 'https://opencode.ai/zen/go/v1',
	consoleURL: 'https://opencode.ai/console',
	usageRange: '30d',
	session: '00000000-0000-4000-8000-000000000000',
	timeoutMs: '20000',
};

function render(label, accountState) {
	stateIndex = 0;
	// Hook call order: useAccount's request state, its two effect slots, then the
	// local form's render tick, then SettingsSection's `open`. Refs persist across
	// renders (keyed by hook slot), which is what makes the staged form work.
	presetStates = [accountState, undefined, undefined, 0, false];
	const tree = registration.component();
	const collected = props(tree);
	const text = flatten(tree).filter((value) => String(value).trim().length > 0);
	if (process.env.OC_DEBUG === '1') {
		const bar = collected.find((entry) => entry['data-savebar'] !== undefined);
		console.log('DEBUG savebar:', JSON.stringify(bar));
	}
	console.log(`\n########## ${label} ##########`);
	console.log(text.join(' | '));
	return { text, props: collected };
}

function expect(label, haystack, needles) {
	const joined = haystack.join(' ');
	for (const needle of needles) {
		if (!joined.includes(needle)) throw new Error(`${label}: missing ${JSON.stringify(needle)}`);
	}
}

const loading = render('loading', { status: 'loading', data: undefined, error: undefined });
expect('loading', loading.text, ['正在读取账户信息']);

const ready = render('ready (go-plus, export spend)', { status: 'ready', data: readyData, error: undefined });
expect('ready', ready.text, [
	'OpenCode 账户',
	'用量配额',
	'5 小时',
	'每周',
	'每月',
	'重置',
	'订阅档位',
	'Go $10/月',
	'Go Plus $40/月',
	'← 当前档位',
	'由 /api/go/status 自动读取',
	'账户',
	'user@example.com',
	'消费与额度',
	'$3.42',
	'来源：Console 用量导出',
	'未设上限',
	'预算重置',
	'为什么没有“余额”数字',
	'模型目录',
	'deepseek-v4-flash',
	'月额度 $60.00',
	'剩余 $59.89',
	'不限量',
	'未收录额度',
	// The Models picker lists three routes, so the page must say which one a
	// model lands on.
	'OpenCode Go (Responses)',
	'设置',
	'高级设置',
]);
// A light user's window is NOT zero: the exact percentage must survive (the
// gateway's /usage would have rounded 0.141% down to a flat 0).
const monthlyBar = ready.props.find((entry) => entry.role === 'progressbar' && entry['aria-label'] === '每月');
if (monthlyBar === undefined) throw new Error('ready: monthly progressbar missing');
if (!(monthlyBar['aria-valuenow'] > 0 && monthlyBar['aria-valuenow'] < 1)) {
	throw new Error(`ready: monthly bar should carry a sub-1% reading, got ${monthlyBar['aria-valuenow']}`);
}
expect('ready exact money', ready.text, ['$0.34 / $48.00', '$0.34 / $120.00', '$0.34 / $240.00', '0.7%', '0.1%']);

// A fresh page must not advertise unsaved changes.
if (ready.text.includes('有未保存的改动')) throw new Error('ready: the save bar must stay hidden on a fresh page');
if (ready.text.includes('放弃')) throw new Error('ready: the discard button must stay hidden on a fresh page');

const burned = render('ready (window burned)', { status: 'ready', data: burnedData, error: undefined });
expect('burned', burned.text, ['已触限', '72.5%']);
const burnedBar = burned.props.find((entry) => entry['aria-label'] === '5 小时');
if (burnedBar === undefined || burnedBar['aria-valuenow'] !== 100) {
	throw new Error('burned: the 5-hour bar should be at 100');
}

const noSpend = render('ready (spend permission denied)', { status: 'ready', data: noSpendData, error: undefined });
expect('noSpend', noSpend.text, ['权限不足', 'HTTP 403']);

const failedModels = render('ready (model catalog failed)', { status: 'ready', data: modelsFailedData, error: undefined });
expect('failedModels', failedModels.text, ['模型目录读取失败', 'HTTP 500']);

const unsetPlan = render('ready (plan unlabelled)', {
	status: 'ready',
	data: { ...readyData, plan: undefined },
	error: undefined,
});
expect('unsetPlan', unsetPlan.text, ['档位未标注']);

const missing = render('missing credential', {
	status: 'ready',
	data: {
		ok: false,
		code: 'MISSING_CREDENTIAL',
		error: 'No OpenCode API key found.',
		apiKeyEnv: 'OPENCODE_API_KEY',
		baseURL: 'https://opencode.ai/zen/go/v1',
	},
	error: undefined,
});
expect('missing', missing.text, ['未找到 API 密钥', 'OPENCODE_API_KEY']);

const upstream = render('upstream error', {
	status: 'ready',
	data: { ok: false, code: 'UPSTREAM_ERROR', error: '/usage → HTTP 401: invalid api key', baseURL: 'https://opencode.ai/zen/go/v1' },
	error: undefined,
});
expect('upstream', upstream.text, ['读取失败', 'HTTP 401']);

globalThis.document = { documentElement: { lang: 'en-US' } };
const english = render('ready (en)', { status: 'ready', data: readyData, error: undefined });
expect('english', english.text, [
	'OpenCode account',
	'Usage quota',
	'Spend & allowance',
	'Why there is no “balance” number',
	'Model catalog',
	'Go Plus $40/month',
	'current plan',
]);

// ---------------------------------------------------------------------------
// Staged form behaviour. Run LAST: the page's local form store is module-scoped,
// so an edit here would leak into every later frame. (With a host inject face
// the store lives in the host's settings scope instead.)
globalThis.document = { ...globalThis.document, documentElement: { lang: 'zh-CN' } };
const formStart = render('form (fresh)', { status: 'ready', data: readyData, error: undefined });
if (formStart.text.includes('有未保存的改动')) throw new Error('form: fresh page must not look dirty');
const planSelect = formStart.props.find((entry) => entry.id === 'oc-plan');
if (planSelect === undefined) throw new Error('form: the plan select is missing');
if (typeof planSelect.onChange !== 'function') throw new Error('form: the plan select has no onChange handler');
if (planSelect.value !== '') throw new Error(`form: the plan select should start empty, got ${planSelect.value}`);
if (process.env.OC_DEBUG === '1') {
	const planEdit = formStart.props.find((entry) => entry.id === 'oc-plan' && typeof entry.onChange === 'function');
	console.log('DEBUG select props:', Object.keys(planEdit ?? {}).join(','));
	console.log('DEBUG first edit result:', String(planEdit.onChange({ target: { value: 'go-plus' } })));
}

planSelect.onChange({ target: { value: 'go-plus' } });
const edited = render('form (plan edited)', { status: 'ready', data: readyData, error: undefined });
expect('form edited', edited.text, ['有未保存的改动', '放弃', '保存', '已自定义']);

const saveActions = edited.props.find((entry) => typeof entry.onDiscard === 'function');
if (saveActions === undefined) {
	console.log('DEBUG bar props:', JSON.stringify(edited.props.filter((entry) => JSON.stringify(Object.keys(entry)).includes('saveBar') || entry['data-savebar'] !== undefined || entry.onSave !== undefined)));
	throw new Error('form: save bar actions missing');
}
saveActions.onDiscard();
const discarded = render('form (discarded)', { status: 'ready', data: readyData, error: undefined });
if (discarded.text.includes('有未保存的改动')) throw new Error('form: discard must clear the dirty flag');
const discardedBar = discarded.props.find((entry) => entry['data-savebar'] !== undefined);
if (discardedBar === undefined || discardedBar['data-savebar'] !== 'hidden') {
	throw new Error('form: the save bar should hide after discard');
}
const planAfter = discarded.props.find((entry) => entry.id === 'oc-plan');
if (planAfter === undefined || planAfter.value !== '') {
	throw new Error(`form: the plan field should be back at its default, got ${JSON.stringify(planAfter?.value)}`);
}

console.log('\nall render branches OK');
