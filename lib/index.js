/**
 * OpenCode account card — node half.
 *
 * One job: answer `GET /opencode/account` for the browser page. The API key
 * never reaches the browser — this half resolves the credential reference,
 * calls OpenCode's own surfaces, derives the money view from the static
 * allowance table, and returns JSON.
 *
 * Design constraints worth preserving:
 *   - Zero third-party imports (see lib/opencode.js), because a `file:`
 *     install must work from any checkout path.
 *   - Partial success is the normal case. A key may read the Go `/usage`
 *     windows while the Console refuses the budget list (an inference-only key
 *     gets 403 there), so each surface carries its own error instead of
 *     failing the whole response. Only a missing credential short-circuits.
 *   - No balance call exists to make (see lib/opencode.js's header comment), so
 *     the payload reports `balance: null` explicitly rather than omitting the
 *     fact — the page can then say "not exposed upstream" instead of showing a
 *     blank that looks like a bug.
 */
import {
	PLANS,
	PLUS_CEILING,
	QUOTA_WINDOWS,
	allowanceFor,
	catalogFor,
	modelEntry,
	normalizePlan,
	routeFor,
} from './catalog.js';
import {
	DEFAULT_API_KEY_ENV,
	DEFAULT_BASE_URL,
	DEFAULT_CONSOLE_URL,
	DEFAULT_TIMEOUT_MS,
	USAGE_RANGES,
	fetchBudgets,
	fetchModels,
	fetchUsage,
	fetchUsageExport,
	maskKey,
	parseUsageCsv,
	readBudgets,
	readModels,
	readUsage,
	resolveApiKey,
	trimBase,
} from './opencode.js';

export const name = 'opencode-account';

/** No hard dependency: the web route is registered through a deferred inject. */
export const inject = [];

/** Provider route whose traffic this deployment sends to OpenCode Go. */
export const DEFAULT_PROVIDER = 'opencode-go';

/** Where the human-visible account console lives. */
export const DEFAULT_DASHBOARD_URL = 'https://opencode.ai/console';

/** The rolling session id the gateway requires on every inference request. */
export const DEFAULT_SESSION = '00000000-0000-4000-8000-000000000000';

const PLANS_FOR_PAGE = PLANS;
const WINDOWS_FOR_PAGE = QUOTA_WINDOWS;

/** Lenient config normalization; junk degrades to defaults instead of failing. */
export function normalizeConfig(value) {
	const source = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
	const timeout = Number(source.timeoutMs);
	const range = typeof source.usageRange === 'string' ? source.usageRange.trim() : '';
	return {
		apiKeyEnv:
			typeof source.apiKeyEnv === 'string' && source.apiKeyEnv.length > 0 ? source.apiKeyEnv : DEFAULT_API_KEY_ENV,
		baseURL: trimBase(source.baseURL, DEFAULT_BASE_URL),
		consoleURL: trimBase(source.consoleURL, DEFAULT_CONSOLE_URL),
		dashboardURL: trimBase(source.dashboardURL, DEFAULT_DASHBOARD_URL),
		provider:
			typeof source.provider === 'string' && source.provider.length > 0 ? source.provider : DEFAULT_PROVIDER,
		plan: normalizePlan(source.plan),
		session:
			typeof source.session === 'string' && source.session.length > 0 ? source.session : DEFAULT_SESSION,
		timeoutMs: Number.isFinite(timeout) && timeout > 0 ? Math.min(120000, timeout) : DEFAULT_TIMEOUT_MS,
		usageRange: USAGE_RANGES.includes(range) ? range : '30d',
	};
}

/**
 * Schema node descriptors matching what dsh-settings' serialization reads, so
 * the served section stays editable and `apiKeyEnv` is treated as a reference
 * name rather than a secret. No schemastery import on purpose.
 */
export const Config = Object.assign(
	(value) => normalizeConfig(value),
	{
		type: 'object',
		dict: {
			apiKeyEnv: { type: 'string' },
			baseURL: { type: 'string' },
			consoleURL: { type: 'string' },
			dashboardURL: { type: 'string' },
			plan: { type: 'string' },
			provider: { type: 'string' },
			session: { type: 'string' },
			timeoutMs: { type: 'number' },
			usageRange: { type: 'string' },
		},
		toJSON() {
			return { type: this.type, dict: this.dict };
		},
		['~standard']: {
			version: 1,
			vendor: 'dsh-opencode-account',
			validate(value) {
				return { value: normalizeConfig(value) };
			},
		},
	},
);

function writeJson(res, status, body) {
	res.setHeader('Content-Type', 'application/json; charset=utf-8');
	res.setHeader('Cache-Control', 'no-store');
	res.statusCode = status;
	res.end(JSON.stringify(body));
}

/**
 * Derive the per-model money view: the allowance comes from the static docs
 * table, the used share from the live percentage. It is an ESTIMATE by
 * construction — the gateway reports one percentage per window, not a
 * per-model dollar figure — and the page labels it as such.
 *
 * The percentage a window reports is measured against that window's own share
 * of the monthly allowance, so it can be read directly as a share of the
 * monthly allowance too (5h percent 20% used == 20% of the monthly figure).
 */
function buildModels(models, usage, plan) {
	const allowances = catalogFor(plan);
	const byId = new Map(allowances.map((entry) => [entry.id, entry]));
	const monthlyPercent = usage?.windows?.monthly?.percent;
	const rows = models.map((entry) => {
		const catalog = byId.get(entry.id) ?? modelEntry(entry.id);
		const allowance = allowanceFor(catalog, plan);
		const unlimited = catalog?.unlimited === true;
		const ratio =
			typeof monthlyPercent === 'number' && Number.isFinite(monthlyPercent)
				? Math.max(0, Math.min(1, monthlyPercent / 100))
				: undefined;
		const used = allowance === undefined || ratio === undefined ? undefined : allowance * ratio;
		return {
			id: entry.id,
			ownedBy: entry.ownedBy,
			created: entry.created,
			name: catalog?.name,
			allowance,
			unlimited,
			catalogued: catalog !== undefined,
			price: catalog?.price,
			peak: catalog?.peak,
			note: catalog?.note,
			/** Which route serves it — the Models picker lists all three. */
			route: catalog?.route ?? routeFor(entry.id),
			usedEstimate: used,
			remainingEstimate: used === undefined || allowance === undefined ? undefined : Math.max(0, allowance - used),
		};
	});
	return rows;
}

async function handleAccount(ctx, settings, req, res) {
	if (req.method !== 'GET') {
		writeJson(res, 405, { ok: false, error: 'Method not allowed' });
		return;
	}

	const key = await resolveApiKey(ctx, settings.apiKeyEnv);
	if (key === undefined) {
		writeJson(res, 200, {
			ok: false,
			code: 'MISSING_CREDENTIAL',
			error:
				`No OpenCode API key found. Store ${settings.apiKeyEnv} in the harness credentials ` +
				`(Settings → Models, or $DSH_HOME/.credentials.yaml) or export ${settings.apiKeyEnv}.`,
			apiKeyEnv: settings.apiKeyEnv,
			baseURL: settings.baseURL,
			consoleURL: settings.consoleURL,
			provider: settings.provider,
			plan: settings.plan,
			dashboardURL: settings.dashboardURL,
			plans: PLANS_FOR_PAGE,
			quotaWindows: WINDOWS_FOR_PAGE,
		});
		return;
	}

	// Five independent surfaces. `/usage` is the only one whose failure removes
	// the page's primary content, so it alone decides `ok`; everything else
	// degrades to a per-card error.
	const [usageResult, modelsResult, budgetsResult, exportResult] = await Promise.all([
		fetchUsage(settings, key.value),
		fetchModels(settings, key.value),
		fetchBudgets(settings, key.value),
		fetchUsageExport(settings, key.value),
	]);

	const usage = usageResult.ok ? readUsage(usageResult.body) : undefined;
	const models = modelsResult.ok ? readModels(modelsResult.body) : [];
	const budgets = budgetsResult.ok ? readBudgets(budgetsResult.body) : [];
	const usageExport = exportResult.ok ? parseUsageCsv(exportResult.text) : undefined;
	const identity = budgets.find((entry) => typeof entry.email === 'string') ?? budgets[0];

	const payload = {
		ok: usageResult.ok,
		code: usageResult.ok ? undefined : 'UPSTREAM_ERROR',
		error: usageResult.ok ? undefined : usageResult.error,
		fetchedAt: new Date().toISOString(),
		keySource: key.source,
		key: maskKey(key.value),
		baseURL: settings.baseURL,
		consoleURL: settings.consoleURL,
		dashboardURL: settings.dashboardURL,
		provider: settings.provider,
		plan: settings.plan,
		plans: PLANS_FOR_PAGE,
		plusCeiling: PLUS_CEILING,
		quotaWindows: WINDOWS_FOR_PAGE,
		usageRange: settings.usageRange,
		session: settings.session,
		identity: identity
			? { userId: identity.userId, email: identity.email }
			: undefined,
		usage: usage
			? { source: usage.source, windows: usage.windows }
			: undefined,
		models: buildModels(models, usage, settings.plan),
		modelCount: models.length,
		budgets,
		balance: null,
		/**
		 * Spend assembled from the Console export when the key may read it (it
		 * needs "All" permission; inference-only keys get 403) and from the
		 * budget rows otherwise, so the card still shows something real.
		 */
		spend: buildSpend(usageExport, budgets),
		errors: {
			usage: usageResult.ok ? undefined : usageResult.error,
			models: modelsResult.ok ? undefined : modelsResult.error,
			budgets: budgetsResult.ok ? undefined : budgetsResult.error,
			usageExport: exportResult.ok ? undefined : exportResult.error,
		},
	};

	writeJson(res, 200, payload);
}

/**
 * The money card's data. `source` names where the figure came from so the page
 * never presents a budget-row number as if it were an itemised spend report.
 */
function buildSpend(usageExport, budgets) {
	if (usageExport !== undefined && usageExport.rowCount > 0) {
		return {
			source: 'usage-export',
			totalCost: usageExport.totalCost,
			totalRequests: usageExport.totalRequests,
			rowCount: usageExport.rowCount,
			days: usageExport.days,
			topModels: usageExport.models.slice(0, 12),
			modelCount: usageExport.models.length,
		};
	}
	if (budgets.length > 0) {
		const spent = budgets.reduce((sum, entry) => sum + (typeof entry.spent === 'number' ? entry.spent : 0), 0);
		const limits = budgets.filter((entry) => typeof entry.limit === 'number');
		return {
			source: 'budgets',
			totalCost: spent,
			totalRequests: undefined,
			rowCount: budgets.length,
			days: [],
			topModels: [],
			modelCount: 0,
			limit: limits.length > 0 ? limits.reduce((sum, entry) => sum + entry.limit, 0) : undefined,
		};
	}
	return undefined;
}

export function apply(ctx, config) {
	const settings = normalizeConfig(config);

	// Deferred: composition order does not matter, and a profile without a web
	// server skips the route instead of failing plugin activation.
	ctx.inject(['webServer'], (serverCtx) => {
		const server = serverCtx.webServer;
		if (server === undefined || typeof server.register !== 'function') return;
		// The ROOT context is what resolves harness services: cordis refuses a
		// `ctx.get(name)` for a service the calling fiber does not declare in its
		// inject list, and this fiber only declared `webServer`. The inject-scoped
		// context therefore cannot reach `credentials` — passing it here silently
		// degraded every lookup to "missing credential".
		const services = ctx;
		serverCtx.effect(() => {
			const dispose = server.register({
				kind: 'exact',
				path: '/opencode/account',
				handler: (req, res) => handleAccount(services, settings, req, res),
			});
			return dispose;
		}, 'opencode-account: account route');
	});
}
