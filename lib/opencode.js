/**
 * OpenCode HTTP client — the one place that talks to opencode.ai.
 *
 * Everything here is dependency-free and Node-native (`fetch`), so the plugin
 * stays install-portable (`dsh plugin add <path>` links a `file:` package, and
 * any bare import would have to resolve from this checkout).
 *
 * Four surfaces are read, and they live in two namespaces because OpenCode
 * itself runs two systems:
 *
 *   Go / Zen inference namespace (the API-key gateway)
 *     GET  {baseURL}/usage    — rolling / weekly / monthly windows: status,
 *                               percent, resetsAt. PERCENTAGES ONLY.
 *     GET  {baseURL}/models   — the model catalog this key may call.
 *
 *   Console namespace (the account/billing REST surface)
 *     GET  {consoleURL}/api/v1/budgets/members
 *                             — one row per member: limit_micro_cents,
 *                               spent_micro_cents, exceeded, resets_at,
 *                               source, plus the member email/user id. THIS is
 *                               the account's real money report. A member with
 *                               no cap configured reports limit=null, which is
 *                               not the same as a cap of zero.
 *     GET  {consoleURL}/api/v1/usage/export?scope=…&range=…
 *                             — streamed CSV of per-day spend. Needs a key with
 *                               "All" permission; an inference-only key answers
 *                               403, which this client reports as a permission
 *                               refusal rather than an outage.
 *
 * There is deliberately NO balance call. `GET /zen/v1/balance`,
 * `GET /zen/v1/credits` and `/console/api/v1/balance` are all real 404s, Zen has
 * no credits route at all, and the Console's own balance field is reachable only
 * through a browser OAuth session (`billing.get` RPC; `/console/api/billing/status`
 * answers 403 to a service-account Bearer). The upstream feature request
 * (anomalyco/opencode#10448) is still open with no official reply. The page
 * therefore reports what a key can actually see and labels the rest as absent.
 *
 * Money unit: Console reports micro-cents, 100_000_000 = 1 USD.
 */
'use strict';

/** Default API-key gateway root (OpenCode Go). */
const DEFAULT_BASE_URL = 'https://opencode.ai/zen/go/v1';

/** Default Console root, which hosts the account/billing REST surface. */
const DEFAULT_CONSOLE_URL = 'https://opencode.ai/console';

/** Micro-cents per US dollar, the unit every Console money field uses. */
const MICRO_CENTS_PER_USD = 100000000;

/** Credential reference this plugin resolves when config names none. */
const DEFAULT_API_KEY_ENV = 'OPENCODE_API_KEY';

/** Extra environment variables honoured as fallbacks, in order. */
const FALLBACK_KEY_ENVS = ['OPENCODE_GO_API_KEY', 'OPENCODE_ZEN_API_KEY'];

/** Per-request budget for every account lookup. */
const DEFAULT_TIMEOUT_MS = 20000;

/** Console usage-export ranges the endpoint accepts. */
const USAGE_RANGES = ['24h', '7d', '30d'];

/** Trim trailing slashes so path joins stay single-slash. */
function trimBase(value, fallback) {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim().replace(/\/+$/, '') : fallback;
}

/** Convert a micro-cent field (string or number) into USD. */
function microCentsToUsd(value) {
	const raw = typeof value === 'string' ? Number(value) : value;
	if (!Number.isFinite(raw)) return undefined;
	return raw / MICRO_CENTS_PER_USD;
}

/** Parse a JSON body, keeping a short taste of non-JSON text for diagnostics. */
function readJson(text) {
	try {
		return { value: JSON.parse(text) };
	} catch {
		return { value: undefined, raw: text.replace(/\s+/g, ' ').slice(0, 200) };
	}
}

/** The most useful message a failing OpenCode response carries. */
function errorDetail(body, raw) {
	if (body !== null && typeof body === 'object') {
		if (typeof body.error === 'string') return body.error;
		if (body.error !== null && typeof body.error === 'object') {
			if (typeof body.error.message === 'string') return body.error.message;
			if (typeof body.error.type === 'string') return body.error.type;
		}
		if (typeof body.message === 'string') return body.message;
		if (typeof body._tag === 'string') return body._tag;
	}
	return typeof raw === 'string' ? raw : '';
}

/**
 * One authenticated GET. Never throws for an HTTP status: the caller decides
 * which surfaces are fatal, and a partial account view is the normal case (a
 * key may read `/usage` while the Console refuses the budget list).
 *
 * @returns {Promise<{ok: boolean, status?: number, body?: unknown, raw?: string, error?: string}>}
 */
async function getJson(base, path, apiKey, timeoutMs, extraHeaders) {
	const url = `${base}${path}`;
	let res;
	try {
		res = await fetch(url, {
			method: 'GET',
			headers: {
				authorization: `Bearer ${apiKey}`,
				accept: 'application/json',
				...(extraHeaders ?? {}),
			},
			signal: AbortSignal.timeout(timeoutMs),
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { ok: false, error: `${path} → ${message}` };
	}
	let text;
	try {
		text = await res.text();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { ok: false, status: res.status, error: `${path} → ${message}` };
	}
	const parsed = readJson(text);
	if (!res.ok) {
		const detail = errorDetail(parsed.value, parsed.raw);
		return {
			ok: false,
			status: res.status,
			body: parsed.value,
			raw: parsed.raw,
			error: `${path} → HTTP ${res.status}${detail ? `: ${detail}` : ''}`,
		};
	}
	if (parsed.value === undefined) {
		return { ok: false, status: res.status, raw: parsed.raw, error: `${path} → unparseable response` };
	}
	return { ok: true, status: res.status, body: parsed.value };
}

/** `GET {baseURL}/usage` — the three Go quota windows. */
function fetchUsage(settings, apiKey) {
	return getJson(settings.baseURL, '/usage', apiKey, settings.timeoutMs);
}

/** `GET {baseURL}/models` — the catalog this key may call. */
function fetchModels(settings, apiKey) {
	return getJson(settings.baseURL, '/models', apiKey, settings.timeoutMs);
}

/** `GET {consoleURL}/api/v1/budgets/members` — the account's money report. */
function fetchBudgets(settings, apiKey) {
	return getJson(settings.consoleURL, '/api/v1/budgets/members', apiKey, settings.timeoutMs);
}

/**
 * `GET {consoleURL}/api/go/status` — the subscription truth.
 *
 * This is the surface the OpenCode console itself reads, and it is strictly
 * better than the Go gateway's `/usage`:
 *
 *   - `/usage` reports `percent` rounded to an INTEGER, so a real 0.705% arrives
 *     as `0` and the page disagrees with the console for every light user;
 *   - `go/status` carries `usedMicroCents` / `limitMicroCents` per window, i.e.
 *     exact money (100_000_000 micro-cents = $1);
 *   - it names the plan (`product: "go-plus"`), which `/usage` cannot;
 *   - it exposes `useBalance`, `renewalProduct`, the billing period and whether
 *     the subscription cancels at period end.
 *
 * `/usage` stays as the fallback for a key that cannot read the console surface.
 */
function fetchGoStatus(settings, apiKey) {
	return getJson(settings.consoleURL, '/api/go/status', apiKey, settings.timeoutMs);
}

/**
 * Normalize `go/status` into the page's shape.
 *
 * Its window keys are `fiveHour` / `week` / `month`; the page — and the
 * gateway's own `/usage` — say `rolling` / `weekly` / `monthly`.
 */
function readGoStatus(body) {
	if (body === null || typeof body !== 'object') return undefined;
	const access = body.access !== null && typeof body.access === 'object' ? body.access : undefined;
	const meters = access?.meters !== null && typeof access?.meters === 'object' ? access.meters : undefined;
	const windows = {};
	for (const [from, to] of [
		['fiveHour', 'rolling'],
		['week', 'weekly'],
		['month', 'monthly'],
	]) {
		const meter = meters?.[from];
		if (meter === null || meter === undefined || typeof meter !== 'object') {
			windows[to] = { status: 'unknown', percent: undefined, resetsAt: undefined };
			continue;
		}
		const used = microCentsToUsd(meter.usedMicroCents);
		const limit = microCentsToUsd(meter.limitMicroCents);
		windows[to] = {
			status: 'ok',
			used,
			limit,
			percent:
				typeof used === 'number' && typeof limit === 'number' && limit > 0 ? (used / limit) * 100 : undefined,
			resetsAt: typeof meter.resetsAt === 'string' ? meter.resetsAt : undefined,
			startsAt: typeof meter.startsAt === 'string' ? meter.startsAt : undefined,
		};
	}
	return {
		source: 'go-status',
		subscriberUserId: typeof body.subscriberUserId === 'string' ? body.subscriberUserId : undefined,
		product: typeof body.product === 'string' ? body.product : undefined,
		renewalProduct: typeof body.renewalProduct === 'string' ? body.renewalProduct : undefined,
		useBalance: body.useBalance === true,
		cancelAtPeriodEnd: body.cancelAtPeriodEnd === true,
		renewalPending: body.renewalPending === true,
		paymentMethodId: typeof body.paymentMethodId === 'string' ? body.paymentMethodId : undefined,
		renewalCurrency: typeof body.renewalCurrency === 'string' ? body.renewalCurrency : undefined,
		periodStartsAt: typeof access?.startsAt === 'string' ? access.startsAt : undefined,
		periodEndsAt: typeof access?.endsAt === 'string' ? access.endsAt : undefined,
		windows,
	};
}

/**
 * `GET {consoleURL}/api/v2/usage/export` — streamed per-day spend CSV. Returned
 * as raw text; the parse happens in `parseUsageCsv` so both halves agree on the
 * shape without this function having to know the columns.
 *
 * v2 is tried first and v1 the other way round, because the two differ in BOTH
 * permission and shape on a real key: measured here, `/api/v1/usage/export`
 * answers 403 for an `oc_sk_` service-account key while `/api/v2/usage/export`
 * answers 200 (and its column names differ — see `parseUsageCsv`). Trying v1
 * first made the spend card claim "permission denied" while the data was one
 * namespace away.
 */
async function fetchUsageExport(settings, apiKey) {
	const attempts = [
		{ path: `/api/v2/usage/export?range=${settings.usageRange}`, label: 'v2' },
		{ path: `/api/v1/usage/export?scope=member&range=${settings.usageRange}`, label: 'v1' },
	];
	let last = { ok: false, error: 'no usage-export endpoint attempted' };
	for (const attempt of attempts) {
		try {
			const res = await fetch(`${settings.consoleURL}${attempt.path}`, {
				method: 'GET',
				headers: {
					authorization: `Bearer ${apiKey}`,
					accept: 'text/csv, application/json',
					'user-agent': 'dsh-opencode-account/0.1.0',
				},
				signal: AbortSignal.timeout(settings.timeoutMs),
			});
			const text = await res.text();
			if (res.ok) return { ok: true, status: res.status, text, endpoint: attempt.label };
			const parsed = readJson(text);
			const detail = errorDetail(parsed.value, parsed.raw);
			last = {
				ok: false,
				status: res.status,
				error: `${attempt.path} → HTTP ${res.status}${detail ? `: ${detail}` : ''}`,
			};
			// A 403 on v1 is exactly the case v2 covers; keep trying, but do not
			// loop forever on a genuine outage.
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			last = { ok: false, error: `${attempt.path} → ${message}` };
		}
	}
	return last;
}

/** Split one CSV line, honouring double-quoted fields. */
function splitCsvLine(line) {
	const cells = [];
	let current = '';
	let quoted = false;
	for (let index = 0; index < line.length; index += 1) {
		const char = line[index];
		if (quoted) {
			if (char === '"') {
				if (line[index + 1] === '"') {
					current += '"';
					index += 1;
				} else {
					quoted = false;
				}
			} else {
				current += char;
			}
		} else if (char === '"') {
			quoted = true;
		} else if (char === ',') {
			cells.push(current);
			current = '';
		} else {
			current += char;
		}
	}
	cells.push(current);
	return cells;
}

/**
 * Fold the usage-export CSV into per-day and per-model totals.
 *
 * Only `cost_micro_cents` matters for the report; token columns are kept
 * because a per-model row without them cannot explain a number.
 *
 * @returns {{days: Array, models: Array, totalCost: number, totalRequests: number, rowCount: number}}
 */
function parseUsageCsv(text) {
	const lines = String(text ?? '')
		.split(/\r?\n/)
		.filter((line) => line.trim().length > 0);
	if (lines.length === 0) return { days: [], models: [], totalCost: 0, totalRequests: 0, rowCount: 0 };
	const header = splitCsvLine(lines[0]).map((cell) => cell.trim());
	/**
	 * Column lookup with v1/v2 aliases. The two export namespaces do not share a
	 * schema: v1 says `scope`/`user_email` and keeps the same token and cost
	 * column names, while v2 adds `user_type`/`user_name`/`last_active_at` and
	 * words its token columns the same way — so the aliases cover the identifiers
	 * that actually differ.
	 */
	const at = (...names) => {
		for (const name of names) {
			const index = header.indexOf(name);
			if (index >= 0) return index;
		}
		return -1;
	};
	const iDay = at('day', 'date');
	const iModel = at('model');
	const iProvider = at('provider');
	const iRequests = at('requests');
	const iInput = at('input_tokens');
	const iOutput = at('output_tokens');
	const iCacheRead = at('cache_read_tokens', 'cached_read_tokens');
	const iCost = at('cost_micro_cents', 'cost_microcents');
	if (iDay < 0 || iCost < 0) return { days: [], models: [], totalCost: 0, totalRequests: 0, rowCount: 0 };

	const days = new Map();
	const models = new Map();
	/** Raw (day, model) rows, so a caller can price any period, not just the file's. */
	const modelDays = [];
	let totalCost = 0;
	let totalRequests = 0;
	let rowCount = 0;
	for (const line of lines.slice(1)) {
		const cells = splitCsvLine(line);
		const day = cells[iDay] ?? '';
		const cost = microCentsToUsd(cells[iCost]);
		if (cost === undefined) continue;
		const requests = iRequests >= 0 ? Number(cells[iRequests]) : undefined;
		const input = iInput >= 0 ? Number(cells[iInput]) : undefined;
		const output = iOutput >= 0 ? Number(cells[iOutput]) : undefined;
		const cacheRead = iCacheRead >= 0 ? Number(cells[iCacheRead]) : undefined;
		rowCount += 1;
		totalCost += cost;
		if (Number.isFinite(requests)) totalRequests += requests;

		const dayRow = days.get(day) ?? { day, cost: 0, requests: 0, input: 0, output: 0, cacheRead: 0 };
		dayRow.cost += cost;
		if (Number.isFinite(requests)) dayRow.requests += requests;
		if (Number.isFinite(input)) dayRow.input += input;
		if (Number.isFinite(output)) dayRow.output += output;
		if (Number.isFinite(cacheRead)) dayRow.cacheRead += cacheRead;
		days.set(day, dayRow);

		const model = iModel >= 0 ? cells[iModel] ?? '' : '';
		const modelRow = models.get(model) ?? {
			model,
			cost: 0,
			requests: 0,
			input: 0,
			output: 0,
			cacheRead: 0,
		};
		modelRow.cost += cost;
		if (Number.isFinite(requests)) modelRow.requests += requests;
		if (Number.isFinite(input)) modelRow.input += input;
		if (Number.isFinite(output)) modelRow.output += output;
		if (Number.isFinite(cacheRead)) modelRow.cacheRead += cacheRead;
		models.set(model, modelRow);
		modelDays.push({ day, model, cost, requests: Number.isFinite(requests) ? requests : 0 });
	}

	const byDay = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
	const byModel = [...models.values()].sort((a, b) => b.cost - a.cost);
	return { days: byDay, models: byModel, modelDays, totalCost, totalRequests, rowCount };
}

/** Normalize one `/usage` window; an unusable row reports as unreadable. */
function readWindow(raw) {
	if (raw === null || typeof raw !== 'object') return { status: 'unknown', percent: undefined, resetsAt: undefined };
	const percent = Number(raw.percent);
	return {
		status: typeof raw.status === 'string' ? raw.status : 'unknown',
		percent: Number.isFinite(percent) ? percent : undefined,
		resetsAt: typeof raw.resetsAt === 'string' ? raw.resetsAt : undefined,
	};
}

/** Normalize `{usage:{…}}` or a bare `{rolling,weekly,monthly}` body. */
function readUsage(body) {
	const source = body !== null && typeof body === 'object' && body.usage ? body.usage : body;
	const windows = {};
	for (const id of ['rolling', 'weekly', 'monthly']) {
		windows[id] = readWindow(source === null || typeof source !== 'object' ? undefined : source[id]);
	}
	return {
		source: source !== null && typeof source === 'object' && typeof source.source === 'string' ? source.source : undefined,
		windows,
	};
}

/** Normalize the `/models` payload into the sorted list the page renders. */
function readModels(body) {
	const source = Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : [];
	const seen = new Set();
	const rows = [];
	for (const entry of source) {
		const id = typeof entry === 'string' ? entry : entry !== null && typeof entry === 'object' ? entry.id : undefined;
		if (typeof id !== 'string' || id.length === 0 || seen.has(id)) continue;
		seen.add(id);
		rows.push({
			id,
			ownedBy:
				entry !== null && typeof entry === 'object' && typeof entry.owned_by === 'string' ? entry.owned_by : undefined,
			created:
				entry !== null && typeof entry === 'object' && Number.isFinite(Number(entry.created))
					? Number(entry.created)
					: undefined,
		});
	}
	rows.sort((a, b) => a.id.localeCompare(b.id));
	return rows;
}

/** Normalize the budgets payload into member rows the page can render. */
function readBudgets(body) {
	if (!Array.isArray(body)) return [];
	return body
		.map((entry) => {
			if (entry === null || typeof entry !== 'object') return undefined;
			const limit = microCentsToUsd(entry.limit_micro_cents);
			const spent = microCentsToUsd(entry.spent_micro_cents);
			return {
				userId: typeof entry.user_id === 'string' ? entry.user_id : undefined,
				email: typeof entry.email === 'string' ? entry.email : undefined,
				limit,
				spent,
				/** `limit === undefined` means the member has no cap — not a cap of 0. */
				capped: limit !== undefined,
				exceeded: entry.exceeded === true,
				resetsAt: typeof entry.resets_at === 'string' ? entry.resets_at : undefined,
				source: typeof entry.source === 'string' ? entry.source : undefined,
				updatedAt: typeof entry.updated_at === 'string' ? entry.updated_at : undefined,
			};
		})
		.filter((entry) => entry !== undefined);
}

/**
 * Mask a credential so the browser can never replay it: the prefix, the length
 * and a truncated head only.
 */
function maskKey(value) {
	if (typeof value !== 'string' || value.length === 0) return undefined;
	return { masked: `${value.slice(0, 11)}…`, length: value.length, prefix: value.slice(0, 6) };
}

/**
 * Resolve the API key: the harness credential store first (so the key in
 * `.credentials.yaml` is found), then the process environment.
 *
 * `credentialRef` is the identity function at runtime (brandString), so the
 * plain reference name works without importing the credentials package.
 *
 * @returns {Promise<{value: string, source: string}|undefined>}
 */
async function resolveApiKey(ctx, refName) {
	const credentials = ctx.get?.('credentials') ?? ctx.credentials;
	if (credentials !== undefined && typeof credentials.resolve === 'function') {
		try {
			const resolved = await credentials.resolve(refName);
			const value = resolved?.value;
			if (typeof value === 'string' && value.length > 0) {
				return { value, source: `credential:${refName}` };
			}
		} catch {
			// A missing/unusable reference falls through to the environment.
		}
	}
	const names = [refName, ...FALLBACK_KEY_ENVS.filter((entry) => entry !== refName)];
	for (const name of names) {
		const fromEnv = process.env[name];
		if (typeof fromEnv === 'string' && fromEnv.length > 0) {
			return { value: fromEnv, source: `env:${name}` };
		}
	}
	return undefined;
}

export {
	DEFAULT_API_KEY_ENV,
	DEFAULT_BASE_URL,
	DEFAULT_CONSOLE_URL,
	DEFAULT_TIMEOUT_MS,
	FALLBACK_KEY_ENVS,
	MICRO_CENTS_PER_USD,
	USAGE_RANGES,
	fetchBudgets,
	fetchGoStatus,
	fetchModels,
	fetchUsage,
	fetchUsageExport,
	maskKey,
	microCentsToUsd,
	parseUsageCsv,
	readBudgets,
	readGoStatus,
	readModels,
	readUsage,
	resolveApiKey,
	splitCsvLine,
	trimBase,
};
