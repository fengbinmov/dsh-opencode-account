/**
 * Static Go / Go Plus catalog: the per-model monthly dollar allowance and the
 * published token prices.
 *
 * Source: https://opencode.ai/docs/go/ — the "Usage limits" section defines the
 * allowance as a MONTHLY DOLLAR AMOUNT per model, split into the three windows
 * every request is measured against (5-hour = 20%, weekly = 50%, monthly =
 * 100%). Prices are USD per 1M tokens.
 *
 * Why ship a table instead of reading the live catalog: the gateway's
 * `GET /zen/go/v1/models` returns ids, `created` and `owned_by` only — it
 * carries no allowance and no price. The allowance exists only in the docs, so
 * it is a static fact of this plugin (and is labelled as such on the page).
 *
 * `go` is the model's monthly allowance in USD on the Go plan. Go Plus uses the
 * same 20/50/100 split over a LARGER per-model allowance; measured against the
 * docs' Go Plus tab it is $60 for every model whose Go allowance is not $60
 * (the $60 rows already sit at that ceiling). `plus` therefore only appears
 * where the docs print a different number, and `plusMultiplier` states the
 * fallback for the rest.
 *
 * `unlimited: true` marks the limited-time free models: no allowance is
 * consumed, so the page shows them as unlimited instead of a percentage.
 *
 * Prices are the Go/Go Plus published rates. Where a model is peak-priced
 * (DeepSeek), the table carries the OFF-PEAK rate and the page says so; the
 * peak rate is listed in `peak`.
 */
'use strict';

/**
 * Go Plus fallback: every model whose Go allowance is below the $60 ceiling is
 * raised to $60 by the plus tier.
 */
const PLUS_CEILING = 60;

/**
 * One catalog row:
 *   id       — the model id the gateway serves
 *   name     — human label
 *   go       — monthly allowance in USD on Go
 *   plus     — monthly allowance in USD on Go Plus (omitted = PLUS_CEILING)
 *   price    — USD per 1M tokens: { input, output, cacheRead, cacheWrite? }
 *   peak     — optional peak-hour price row for models the docs price by hour
 *   unlimited— free model: consumes no allowance
 *   note     — short remark rendered under the model filter
 */
const MODELS = [
	{
		id: 'deepseek-v4-flash',
		name: 'DeepSeek V4 Flash',
		go: 30,
		price: { input: 0.15, output: 0.6, cacheRead: 0.003 },
		peak: { input: 0.3, output: 1.2, cacheRead: 0.006 },
		note: 'peak',
	},
	{
		id: 'deepseek-v4-flash-vision-exp',
		name: 'DeepSeek V4 Flash Vision Exp',
		go: 15,
		price: { input: 0.15, output: 0.6, cacheRead: 0.003 },
		peak: { input: 0.3, output: 1.2, cacheRead: 0.006 },
		note: 'peak',
	},
	{
		id: 'deepseek-v4.1-flash',
		name: 'DeepSeek V4.1 Flash',
		go: 60,
		price: { input: 0.15, output: 0.6, cacheRead: 0.003 },
		peak: { input: 0.3, output: 1.2, cacheRead: 0.006 },
		note: 'peak',
	},
	{
		id: 'deepseek-v4-pro',
		name: 'DeepSeek V4 Pro',
		go: 15,
		price: { input: 0.66, output: 1.98, cacheRead: 0.022 },
		peak: { input: 1.32, output: 3.96, cacheRead: 0.044 },
		note: 'peak',
	},
	{ id: 'glm-5.2', name: 'GLM-5.2', go: 60, price: { input: 1.4, output: 4.4, cacheRead: 0.26 } },
	{ id: 'glm-5.3', name: 'GLM-5.3', go: 15, price: { input: 1.4, output: 4.4, cacheRead: 0.26 } },
	{ id: 'glm-5.3-flash', name: 'GLM-5.3-Flash', go: 60, price: { input: 0.15, output: 0.5, cacheRead: 0.03 } },
	{
		id: 'gpt-5.6-luna',
		name: 'GPT 5.6 Luna',
		go: 15,
		price: { input: 0.2, output: 1.2, cacheRead: 0.02, cacheWrite: 0.25 },
		note: 'long-context',
	},
	{
		id: 'gpt-6-luna',
		name: 'GPT 6 Luna',
		go: 15,
		price: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
		note: 'long-context',
	},
	{ id: 'grok-4.6', name: 'Grok 4.6', go: 15, price: { input: 2, output: 6, cacheRead: 0.5 }, note: 'long-context' },
	{ id: 'grok-4.7', name: 'Grok 4.7', go: 15, price: { input: 2, output: 6, cacheRead: 0.5 }, note: 'long-context' },
	/**
	 * `deepseek-flash` is served by the gateway but absent from the published Go
	 * table. It belongs to the same gateway family as V4 Flash, so it inherits
	 * that row's numbers — and carries the `inherited` note, so the page never
	 * presents a borrowed figure as a documented one.
	 */
	{
		id: 'deepseek-flash',
		name: 'DeepSeek Flash',
		go: 30,
		price: { input: 0.15, output: 0.6, cacheRead: 0.003 },
		peak: { input: 0.3, output: 1.2, cacheRead: 0.006 },
		note: 'inherited',
	},
	{ id: 'hy3', name: 'Hy3', go: 60, price: { input: 0.14, output: 0.58, cacheRead: 0.035 } },
	{ id: 'hy4-preview', name: 'Hy4 preview', go: 30, price: { input: 0.834, output: 2.501, cacheRead: 0.042 } },
	{ id: 'kimi-k2.6', name: 'Kimi K2.6', go: 60, price: { input: 0.95, output: 4, cacheRead: 0.16 } },
	{ id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code', go: 60, price: { input: 0.95, output: 4, cacheRead: 0.19 } },
	{ id: 'kimi-k3', name: 'Kimi K3', go: 15, price: { input: 3, output: 15, cacheRead: 0.3 } },
	{ id: 'longcat-2.0', name: 'LongCat-2.0', go: 60, price: { input: 0.3, output: 1.2, cacheRead: 0.006 } },
	{
		id: 'longcat-2.5-preview-free',
		name: 'LongCat 2.5 Preview Free',
		go: 0,
		unlimited: true,
		price: { input: 0, output: 0, cacheRead: 0 },
	},
	{ id: 'mimo-v2.5', name: 'MiMo V2.5', go: 60, price: { input: 0.14, output: 0.28, cacheRead: 0.0028 } },
	{ id: 'mimo-v2.5-pro', name: 'MiMo V2.5 Pro', go: 15, price: { input: 0.435, output: 0.87, cacheRead: 0.003625 } },
	{ id: 'mimo-v2.6-flash', name: 'MiMo V2.6 Flash', go: 60, price: { input: 0.14, output: 0.28, cacheRead: 0.0028 } },
	{ id: 'mimo-v2.6-pro', name: 'MiMo V2.6 Pro', go: 15, price: { input: 0.435, output: 0.87, cacheRead: 0.003625 } },
	{ id: 'minimax-m2.7', name: 'MiniMax M2.7', go: 60, price: { input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0.375 } },
	{ id: 'minimax-m3', name: 'MiniMax M3', go: 60, price: { input: 0.3, output: 1.2, cacheRead: 0.06 } },
	{
		id: 'muse-spark-1.2-contributor',
		name: 'Muse Spark 1.2 Contributor',
		go: 60,
		price: { input: 0.1, output: 0.2, cacheRead: 0.002 },
		note: 'training',
	},
	{
		id: 'muse-spark-1.3-contributor',
		name: 'Muse Spark 1.3 Contributor',
		go: 60,
		price: { input: 0.1, output: 0.2, cacheRead: 0.002 },
		note: 'training',
	},
	{
		id: 'qwen3.7-plus',
		name: 'Qwen3.7 Plus',
		go: 60,
		price: { input: 0.4, output: 1.6, cacheRead: 0.04, cacheWrite: 0.5 },
		note: 'long-context',
	},
	{
		id: 'qwen3.8-flash',
		name: 'Qwen3.8 Flash',
		go: 30,
		price: { input: 0.15, output: 0.47, cacheRead: 0.016, cacheWrite: 0.2 },
	},
	{
		id: 'qwen3.8-max',
		name: 'Qwen3.8 Max',
		go: 15,
		price: { input: 2, output: 6, cacheRead: 0.25, cacheWrite: 2.5 },
	},
	{
		id: 'space-bunny-free',
		name: 'Space Bunny Free',
		go: 0,
		unlimited: true,
		price: { input: 0, output: 0, cacheRead: 0 },
	},
];

/** Indexed form for O(1) lookups. */
const BY_ID = new Map(MODELS.map((entry) => [entry.id, entry]));

/**
 * The plan tiers this catalog knows. Both consume the same three windows; the
 * tier only scales the per-model monthly allowance.
 */
const PLANS = [
	{ id: 'go', name: 'Go', pricePerMonth: 10 },
	{ id: 'go-plus', name: 'Go Plus', pricePerMonth: 40 },
];

/** The three quota windows, as shares of a model's monthly allowance. */
const QUOTA_WINDOWS = [
	{ id: 'rolling', label: '5-hour', shareOfMonthly: 0.2 },
	{ id: 'weekly', label: 'Weekly', shareOfMonthly: 0.5 },
	{ id: 'monthly', label: 'Monthly', shareOfMonthly: 1 },
];

/**
 * One route per wire protocol. dsh takes a model's protocol from the ROUTE (a
 * `models` entry has no `api` field), so the Go catalog — which spans three
 * protocols — has to be served by three routes. The page names the route a
 * model lands on, because the Models picker lists all three.
 *
 * Kept in step with `scripts/build-provider-models.mjs`.
 */
const ROUTES = {
	'openai-completions': { id: 'opencode-go', label: 'OpenCode Go' },
	'openai-responses': { id: 'opencode-go-responses', label: 'OpenCode Go (Responses)' },
	'anthropic-messages': { id: 'opencode-go-messages', label: 'OpenCode Go (Messages)' },
};

/**
 * The gateway's own protocol assignment, for the ids this table knows about.
 * Anything absent speaks the OpenAI-compatible endpoint, which is what most of
 * the catalog uses.
 */
const MODEL_PROTOCOL = {
	'gpt-5.6-luna': 'openai-responses',
	'gpt-6-luna': 'openai-responses',
	'grok-4.6': 'openai-responses',
	'grok-4.7': 'openai-responses',
	'muse-spark-1.2-contributor': 'openai-responses',
	'muse-spark-1.3-contributor': 'openai-responses',
	// Measured, not guessed: pi-ai's catalog calls this one `openai-completions`
	// while the gateway answers `400 ModelProtocolUnsupported` there and serves
	// it on `messages`. `scripts/probe-protocol.mjs` re-checks the pairing.
	'minimax-m2.7': 'anthropic-messages',
	'minimax-m3': 'anthropic-messages',
	'qwen3.8-flash': 'anthropic-messages',
};

/** Normalize a plan id; unknown values fall back to undefined (tier unlabelled). */
function normalizePlan(value) {
	if (typeof value !== 'string') return undefined;
	const plan = value.trim().toLowerCase();
	return PLANS.some((entry) => entry.id === plan) ? plan : undefined;
}

/** The route serving one model id, as the page should name it. */
function routeFor(id) {
	return ROUTES[MODEL_PROTOCOL[id] ?? 'openai-completions'];
}

/** The monthly allowance in USD for one catalog row on one plan. */
function allowanceFor(entry, plan) {
	if (entry === undefined) return undefined;
	if (entry.unlimited === true) return undefined;
	if (plan === 'go-plus') return entry.plus === undefined ? PLUS_CEILING : entry.plus;
	return entry.go;
}

/** The catalog row for a model id, or undefined when the id is not catalogued. */
function modelEntry(id) {
	return BY_ID.get(id);
}

/**
 * The catalog as the browser reads it: every row, plus which rows the live
 * `/models` list actually serves.
 */
function catalogFor(plan) {
	return MODELS.map((entry) => ({
		id: entry.id,
		name: entry.name,
		allowance: allowanceFor(entry, plan),
		unlimited: entry.unlimited === true,
		price: entry.price,
		peak: entry.peak,
		note: entry.note,
		route: routeFor(entry.id),
	}));
}

export {
	MODELS,
	PLANS,
	PLUS_CEILING,
	QUOTA_WINDOWS,
	ROUTES,
	allowanceFor,
	catalogFor,
	modelEntry,
	normalizePlan,
	routeFor,
};
