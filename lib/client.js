/**
 * OpenCode account page — browser half.
 *
 * Renders a `settings.section` page (Settings → OpenCode) in a deliberately
 * minimal shape: a one-line header, the account / route facts as a single
 * key-value grid, the Go quota windows as one-line meters, the Console spend
 * report and the live model catalog.
 *
 * Every explanatory sentence lives in a `title` tooltip instead of a paragraph,
 * so the page reads as labels and numbers only. Numbers come from the node
 * half's `GET /opencode/account`; this file never talks to opencode.ai and never
 * sees the API key (only its mask).
 *
 * Packaged in the dsh client module format (`window.__ModuleLoader__.load`) so
 * the web app loads it without a build step. The loader id MUST equal the
 * package name — the client module system resolves that id in its manifest and
 * fails the whole bundle when a loaded module registers nothing.
 */
window.__ModuleLoader__.load({
	id: 'dsh-opencode-account',
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

		const react = require('react');
		const h = react.createElement;

		/** Keep in step with package.json — shown in the page footer. */
		const PLUGIN_VERSION = '0.1.5';

		//#region copy

		const COPY = {
			zh: {
				nav: 'OpenCode',
				title: 'OpenCode 账户',
				refresh: '刷新',
				refreshing: '刷新中…',
				updated: '更新于',
				autoNote: '每 5 分钟自动刷新',
				loading: '正在读取账户信息…',
				empty: '没有可显示的数据。',
				errorTitle: '读取失败',
				missingKey: '未找到 API 密钥',
				hint: '把 OPENCODE_API_KEY 存进 $DSH_HOME/.credentials.yaml，或在 Models 页填入密钥。',
				accountTitle: '账户',
				identity: '账号',
				identityUnknown: '未返回账号信息',
				plan: '订阅档位',
				planGo: 'Go $10/月',
				planGoPlus: 'Go Plus $40/月',
				planCurrent: '← 当前档位',
				planFromApi: '由 /api/go/status 自动读取',
				planUnset: '档位未标注',
				planUnsetHint: '官方 API 不暴露档位：可在插件 config 里写 plan: go 或 go-plus。',
				key: '密钥',
				keySource: '来源',
				route: 'provider 路由',
				baseURL: 'API 根',
				session: '会话 ID',
				sessionNote: '网关要求每个请求带 x-opencode-session，缺失时返回 400。',
				quotaTitle: '用量配额',
				quotaNote: '三档 = 各模型月额度的 5 小时 20% / 每周 50% / 每月 100%；金额取自 /api/go/status 的微美分精确值。',
				windowRolling: '5 小时',
				windowWeekly: '每周',
				windowMonthly: '每月',
				resets: '重置',
				resetPassed: '已过重置点',
				statusRateLimited: '已触限',
				statusUnknown: '状态未知',
				moneyTitle: '消费与额度',
				noBalanceTitle: '为什么没有“余额”数字',
				noBalanceBody:
					'opencode.ai 没有公开的余额端点：/zen/v1/balance、/zen/v1/credits、/console/api/v1/balance 实测全部 404，' +
					'官方 issue #10448 仍无回复。下面是一个密钥能观测到的全部账户事实。',
				spendSourceExport: '来源：Console 用量导出',
				spendSourceBudgets: '来源：Console 预算报表',
				spendUnavailable: '读不到 Console 消费数据',
				spendPermission: '权限不足：inference-only 密钥读不到 Console 预算与用量导出（HTTP 403）。',
				spendTotal: '区间消费',
				spendRequests: '请求数',
				spendRows: '明细行',
				spendRange: '统计区间',
				budgetLimit: '预算上限',
				budgetUncapped: '未设上限',
				budgetExceeded: '已超限',
				budgetResets: '预算重置',
				openConsole: '打开 Console ↗',
				modelsTitle: '模型目录',
				modelsNote: '来自 {baseURL}/models；月额度取自官方静态表，已用金额取自 Console 用量导出。',
				routeHint: '该模型在 Models 页属于这条路由：',
				modelsError: '模型目录读取失败（配额仍可用）：',
				noModels: '未取到模型列表。',
				modelsCount: '共 {count} 个模型',
				modelsShort: '{count} 个模型',
				monthlyAllowance: '月额度',
				allowancePerMonth: '/月',
				usedLabel: '已用（本计费周期）',
				remaining: '剩余',
				unlimited: '不限量',
				uncatalogued: '未收录额度',
				priceTitle: '价格 / 1M tokens',
				priceIn: '入',
				priceOut: '出',
				priceCache: '缓存读',
				priceWrite: '缓存写',
				priceFree: '免费',
				pricePeak: '峰时',
				pricePeakHint: '峰时为 UTC 周一至周五 01:00-04:00 与 06:00-10:00，其余时段按上面的价格计费',
				extraInput: '额外输入',
				extraInputNote: 'dsh 目前只能声明 text/image，这里仅供参考',
			},
			en: {
				nav: 'OpenCode',
				title: 'OpenCode account',
				refresh: 'Refresh',
				refreshing: 'Refreshing…',
				updated: 'Updated',
				autoNote: 'Auto-refreshes every 5 minutes',
				loading: 'Reading account…',
				empty: 'Nothing to show.',
				errorTitle: 'Lookup failed',
				missingKey: 'No API key found',
				hint: 'Store OPENCODE_API_KEY in $DSH_HOME/.credentials.yaml, or paste it on the Models page.',
				accountTitle: 'Account',
				identity: 'Identity',
				identityUnknown: 'No identity returned',
				plan: 'Plan',
				planGo: 'Go $10/month',
				planGoPlus: 'Go Plus $40/month',
				planCurrent: '← current plan',
				planFromApi: 'read from /api/go/status',
				planUnset: 'Plan not labelled',
				planUnsetHint: 'The public API does not expose the tier: set plan: go or go-plus in this plugin’s config.',
				key: 'Key',
				keySource: 'Source',
				route: 'Provider route',
				baseURL: 'API root',
				session: 'Session id',
				sessionNote: 'The gateway requires x-opencode-session on every request; without it the answer is 400.',
				quotaTitle: 'Usage quota',
				quotaNote:
					'Windows are shares of each model’s monthly allowance: 5 hours 20%, weekly 50%, monthly 100%. Amounts come from /api/go/status in micro-cents.',
				windowRolling: '5 hours',
				windowWeekly: 'Weekly',
				windowMonthly: 'Monthly',
				resets: 'resets',
				resetPassed: 'reset point passed',
				statusRateLimited: 'Limit reached',
				statusUnknown: 'Status unknown',
				moneyTitle: 'Spend & allowance',
				noBalanceTitle: 'Why there is no “balance” number',
				noBalanceBody:
					'opencode.ai exposes no public balance endpoint: /zen/v1/balance, /zen/v1/credits and /console/api/v1/balance all answer 404, and upstream issue #10448 has no reply. Below is every account fact a key can observe.',
				spendSourceExport: 'Source: Console usage export',
				spendSourceBudgets: 'Source: Console budget report',
				spendUnavailable: 'Console spend data unavailable',
				spendPermission: 'Insufficient permission: an inference-only key cannot read the Console budget list or usage export (HTTP 403).',
				spendTotal: 'Spend in range',
				spendRequests: 'Requests',
				spendRows: 'Rows',
				spendRange: 'Range',
				budgetLimit: 'Budget limit',
				budgetUncapped: 'No cap set',
				budgetExceeded: 'Exceeded',
				budgetResets: 'Budget resets',
				openConsole: 'Open Console ↗',
				modelsTitle: 'Model catalog',
				modelsNote: 'Served by {baseURL}/models; the monthly allowance comes from the published table and spend from the Console usage export.',
				routeHint: 'In the Models page this model lives under the route:',
				modelsError: 'Model catalog unavailable (quota still shown):',
				noModels: 'No model list returned.',
				modelsCount: '{count} models',
				modelsShort: '{count} models',
				monthlyAllowance: 'Monthly allowance',
				allowancePerMonth: '/mo',
				usedLabel: 'Used (this billing period)',
				remaining: 'Remaining',
				unlimited: 'Unlimited',
				uncatalogued: 'No allowance on file',
				priceTitle: 'Price / 1M tokens',
				priceIn: 'in',
				priceOut: 'out',
				priceCache: 'cache read',
				priceWrite: 'cache write',
				priceFree: 'free',
				pricePeak: 'peak',
				pricePeakHint: 'Peak hours are 01:00-04:00 and 06:00-10:00 UTC, Monday to Friday; other hours bill at the rate above',
				extraInput: 'also accepts',
				extraInputNote: 'dsh can only declare text/image so far — shown for information',
			},
		};

		function languageTag() {
			try {
				const lang = document.documentElement.lang || navigator.language || '';
				return String(lang).toLowerCase().startsWith('zh') ? 'zh' : 'en';
			} catch {
				return 'zh';
			}
		}

		//#endregion

		//#region formatting

		function num(value) {
			const parsed = Number(value);
			return Number.isFinite(parsed) ? parsed : undefined;
		}

		function money(value, digits) {
			const parsed = num(value);
			if (parsed === undefined) return '—';
			return `$${parsed.toFixed(digits === undefined ? 2 : digits)}`;
		}

		/** Tiny amounts keep more digits so a real spend never renders as $0.00. */
		function moneyExact(value) {
			const parsed = num(value);
			if (parsed === undefined) return '—';
			return `$${parsed.toFixed(Math.abs(parsed) < 0.01 && parsed !== 0 ? 4 : 2)}`;
		}

		function percent(value) {
			const parsed = num(value);
			if (parsed === undefined) return '—';
			return `${Math.round(parsed * 10) / 10}%`;
		}

		function count(value) {
			const parsed = num(value);
			return parsed === undefined ? '—' : parsed.toLocaleString();
		}

		function day(iso) {
			if (typeof iso !== 'string' || iso.length === 0) return '—';
			const at = Date.parse(iso);
			if (!Number.isFinite(at)) return iso;
			const d = new Date(at);
			const pad = (n) => String(n).padStart(2, '0');
			return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
		}

		function stamp(iso) {
			if (typeof iso !== 'string' || iso.length === 0) return '—';
			const at = Date.parse(iso);
			if (!Number.isFinite(at)) return iso;
			const d = new Date(at);
			const pad = (n) => String(n).padStart(2, '0');
			return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
		}

		function dayTime(iso) {
			if (typeof iso !== 'string' || iso.length === 0) return '—';
			const at = Date.parse(iso);
			if (!Number.isFinite(at)) return iso;
			return `${day(iso)} ${stamp(iso)}`;
		}

		/** Human countdown to a reset timestamp. */
		function countdown(iso, copy) {
			if (typeof iso !== 'string' || iso.length === 0) return undefined;
			const at = Date.parse(iso);
			if (!Number.isFinite(at)) return undefined;
			const ms = at - Date.now();
			if (ms <= 0) return copy.resetPassed;
			const minutes = Math.floor(ms / 60000);
			if (minutes < 60) return `${minutes} min`;
			const hours = Math.floor(minutes / 60);
			if (hours < 24) return `${hours} h ${minutes % 60} min`;
			const daysLeft = Math.floor(hours / 24);
			return `${daysLeft} d ${hours % 24} h`;
		}

		/** Clamped 0..1 ratio; a cap of 0 is "uncapped", never "100% used". */
		function ratio(used, cap) {
			if (!(typeof cap === 'number') || cap <= 0) return 0;
			if (!(typeof used === 'number')) return 0;
			return Math.max(0, Math.min(1, used / cap));
		}

		/** `{count}`-style placeholders, kept out of the components. */
		function fill(template, values) {
			let out = String(template);
			for (const key of Object.keys(values)) {
				out = out.split(`{${key}}`).join(String(values[key]));
			}
			return out;
		}

		//#endregion

		//#region styles

		const PAGE_CSS_ID = 'dsh-opencode-account/OpenCodeSettingsPage.module.css';

		/**
		 * Selectors are all `oc-`-prefixed so nothing here can leak into the
		 * harness's own pages; colours come from `--dsw-alias-*` theme variables
		 * only, so the page follows the active light/dark theme.
		 *
		 * The layout rule for this page: labels and numbers only. Group headers
		 * carry a hairline, rows align on a shared grid, and every sentence of
		 * explanation lives in a `title` tooltip rather than in a paragraph.
		 */
		const PAGE_CSS = `
.oc-section{max-width:720px;color:var(--dsw-alias-label-primary);flex-direction:column;display:flex}
.oc-header{align-items:center;justify-content:space-between;gap:16px;display:flex}
.oc-title{margin:0;font-size:18px;font-weight:600;line-height:26px;letter-spacing:-.01em}
.oc-headerRight{align-items:center;gap:10px;display:flex}
.oc-stamp{color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:17px;font-variant-numeric:tabular-nums;white-space:nowrap}
.oc-group{flex-direction:column;display:flex;margin-top:24px}
.oc-groupHead{align-items:center;gap:8px;display:flex;border-bottom:.5px solid var(--dsw-alias-border-l2);padding-bottom:7px}
.oc-groupTitle{margin:0;font-size:13px;font-weight:600;line-height:20px;letter-spacing:.01em;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.oc-groupNote{color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:17px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.oc-spacer{flex:1}
.oc-badgeMuted{border:.5px solid var(--dsw-alias-border-l4);border-radius:999px;corner-shape:round;color:var(--dsw-alias-label-tertiary);padding:1px 8px;font-size:11px;font-weight:500;line-height:17px;white-space:nowrap}
.oc-badgeActive{border:.5px solid var(--dsw-alias-brand-primary);border-radius:999px;corner-shape:round;color:var(--dsw-alias-brand-primary);padding:1px 8px;font-size:11px;font-weight:500;line-height:17px;white-space:nowrap}
.oc-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px}
.oc-kv{display:grid;grid-template-columns:auto minmax(0,1fr);gap:7px 18px;align-items:baseline;padding:12px 0 0}
.oc-kvLabel{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;white-space:nowrap}
.oc-kvValue{color:var(--dsw-alias-label-primary);font-size:12.5px;line-height:18px;font-variant-numeric:tabular-nums;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.oc-kvValueMuted{color:var(--dsw-alias-label-tertiary)}
.oc-plan{align-items:center;gap:8px;display:flex;flex-wrap:wrap;padding:13px 0 0}
.oc-planLabel{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;white-space:nowrap}
.oc-planNote{color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:17px}
.oc-windows{display:grid;grid-template-columns:56px minmax(48px,1fr) auto auto auto;align-items:center;gap:11px 12px;padding:11px 0 0}
.oc-window{display:contents}
.oc-windowLabel{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;white-space:nowrap}
.oc-bar{overflow:hidden;background:var(--dsw-alias-border-l2);border-radius:999px;corner-shape:round;height:3px}
.oc-barFill{background:var(--dsw-alias-brand-primary);border-radius:999px;corner-shape:round;height:100%;transition:width .3s ease}
.oc-barFillWarn{background:var(--dsw-alias-state-error-primary)}
.oc-windowAmount{color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:17px;font-variant-numeric:tabular-nums;white-space:nowrap}
.oc-windowValue{color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right;min-width:42px}
.oc-windowReset{color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:17px;white-space:nowrap;text-align:right}
.oc-windowResetWarn{color:var(--dsw-alias-state-error-primary);font-size:11.5px;line-height:17px;white-space:nowrap;text-align:right}
.oc-stats{grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:8px;display:grid;padding:12px 0 0}
.oc-stat{min-width:0;flex-direction:column;gap:1px;display:flex;padding:9px 11px;border-radius:10px;background:var(--dsw-alias-bg-module-platform)}
.oc-statLabel{color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:17px}
.oc-statValue{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:22px;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.oc-statSub{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.oc-meters{display:grid;grid-template-columns:minmax(0,auto) 180px auto;justify-content:start;align-items:center;gap:9px 12px;padding:12px 0 0}
.oc-meterRow{display:contents;font-size:12px;line-height:18px}
.oc-meterLabel{color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.oc-meterTrack{overflow:hidden;background:var(--dsw-alias-border-l2);border-radius:999px;corner-shape:round;height:3px}
.oc-meterFill{display:block;background:var(--dsw-alias-brand-primary);border-radius:999px;corner-shape:round;height:100%}
.oc-meterFillWarn{background:var(--dsw-alias-state-error-primary)}
.oc-meterValue{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap}
.oc-models{flex-direction:column;display:flex;padding:3px 0 0}
.oc-model{flex-direction:column;gap:7px;display:flex;padding:11px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}
.oc-model:last-child{border-bottom:0;padding-bottom:3px}
.oc-modelHead{align-items:baseline;gap:8px;display:flex;min-width:0}
.oc-modelId{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;font-weight:500;line-height:19px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.oc-modelName{color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:18px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.oc-modelNote{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px;white-space:nowrap}
.oc-modelAllowance{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;font-variant-numeric:tabular-nums;white-space:nowrap}
.oc-modelMeter{display:grid;grid-template-columns:minmax(0,220px) auto;align-items:center;gap:10px}
.oc-prices{flex-wrap:wrap;gap:3px 12px;display:flex}
.oc-price{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px;font-variant-numeric:tabular-nums;white-space:nowrap}
.oc-emptyModels{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;padding:10px 0 0}
.oc-notice{border:.5px solid var(--dsw-alias-border-l4);border-radius:10px;padding:11px 13px;display:flex;flex-direction:column;gap:4px;margin-top:14px}
.oc-noticeError{border-color:var(--dsw-alias-state-error-primary)}
.oc-noticeTitle{margin:0;font-size:13px;font-weight:600;line-height:20px}
.oc-noticeError .oc-noticeTitle{color:var(--dsw-alias-state-error-primary)}
.oc-noticeBody{color:var(--dsw-alias-label-secondary);margin:0;font-size:12px;line-height:18px;word-break:break-word}
.oc-noticeMuted{color:var(--dsw-alias-label-tertiary);margin:0;font-size:11.5px;line-height:17px;word-break:break-word}
.oc-rowError{color:var(--dsw-alias-state-error-primary);margin:9px 0 0;font-size:11.5px;line-height:17px;word-break:break-word}
.oc-link{color:var(--dsw-alias-link,var(--dsw-alias-brand-primary));text-decoration:none;font-size:12px;line-height:18px}
.oc-link:hover{text-decoration:underline}
.oc-footer{align-items:center;gap:12px;display:flex;margin-top:22px;padding-top:11px;border-top:.5px solid var(--dsw-alias-border-l2)}
.oc-button{box-sizing:border-box;height:28px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l4);border-radius:14px;corner-shape:round;background:0 0;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;cursor:pointer;transition:background .15s ease}
.oc-button:hover:not(:disabled){background:var(--dsw-alias-bg-module-platform)}
.oc-button:disabled{opacity:.55;cursor:default}
.oc-version{color:var(--dsw-alias-label-tertiary);margin:0;font-size:11px;line-height:17px;white-space:nowrap}
@media (prefers-reduced-motion:reduce){.oc-barFill{transition:none}.oc-button{transition:none}}
`;

		function injectPageCss() {
			if (typeof document === 'undefined') return;
			if (document.querySelector(`style[data-plugin-css="${PAGE_CSS_ID}"]`) !== null) return;
			const tag = document.createElement('style');
			tag.dataset.plugin = 'dsh-opencode-account';
			tag.dataset.pluginCss = PAGE_CSS_ID;
			tag.textContent = PAGE_CSS;
			document.head.appendChild(tag);
		}

		//#endregion

		//#region data

		const REFRESH_MS = 5 * 60 * 1000;
		const TICK_MS = 30000;

		function useAccount() {
			const [state, setState] = react.useState({ status: 'loading', data: undefined, error: undefined });
			const load = react.useCallback(async () => {
				setState((prev) => ({ ...prev, status: prev.data ? 'refreshing' : 'loading' }));
				try {
					const res = await fetch('/opencode/account', {
						headers: { accept: 'application/json' },
						cache: 'no-store',
					});
					const body = await res.json();
					setState({ status: 'ready', data: body, error: undefined });
				} catch (error) {
					setState((prev) => ({
						...prev,
						status: 'error',
						error: error && error.message ? error.message : String(error),
					}));
				}
			}, []);
			react.useEffect(() => {
				void load();
			}, [load]);
			react.useEffect(() => {
				const id = window.setInterval(() => {
					void load();
				}, REFRESH_MS);
				return () => {
					window.clearInterval(id);
				};
			}, [load]);
			return { ...state, reload: load };
		}

		/** Re-render on a slow tick so the reset countdowns stay honest. */
		function useNow() {
			const [, setTick] = react.useState(0);
			react.useEffect(() => {
				const id = window.setInterval(() => {
					setTick((value) => value + 1);
				}, TICK_MS);
				return () => {
					window.clearInterval(id);
				};
			}, []);
		}

		//#endregion

		//#region components

		/**
		 * One titled block. `hint` is the tooltip that replaces the explanatory
		 * paragraph this page used to print under every heading.
		 */
		function Group(spec, children) {
			return h(
				'section',
				{ className: 'oc-group', key: spec.title },
				h(
					'div',
					{ className: 'oc-groupHead' },
					h('h3', { className: 'oc-groupTitle', title: spec.hint }, spec.title),
					spec.note ? h('span', { className: 'oc-groupNote' }, spec.note) : null,
					h('span', { className: 'oc-spacer' }),
					spec.right ?? null,
				),
				...children,
			);
		}

		/**
		 * One key-value pair as the two grid cells it occupies. Returned as an
		 * array so callers can spread several pairs into a single `.oc-kv` grid —
		 * that shared grid is what aligns every label and every value.
		 */
		function Kv(label, value, options) {
			const opts = options ?? {};
			return [
				h('div', { className: 'oc-kvLabel', key: `${label}-label`, title: opts.labelHint }, label),
				h(
					'div',
					{
						className: opts.muted ? 'oc-kvValue oc-kvValueMuted' : 'oc-kvValue',
						key: `${label}-value`,
						title: opts.valueHint ?? (typeof value === 'string' ? value : undefined),
					},
					value,
				),
			];
		}

		function Stat(label, value, sub) {
			return h(
				'div',
				{ className: 'oc-stat', key: label },
				h('div', { className: 'oc-statLabel' }, label),
				h('div', { className: 'oc-statValue', title: typeof value === 'string' ? value : undefined }, value),
				sub ? h('div', { className: 'oc-statSub', title: sub }, sub) : null,
			);
		}

		function Notice(props) {
			const children = [
				h('p', { className: 'oc-noticeTitle', key: 'title' }, props.title),
				props.body ? h('p', { className: 'oc-noticeBody', key: 'body' }, props.body) : null,
			];
			if (props.lines) {
				for (let index = 0; index < props.lines.length; index += 1) {
					children.push(h('p', { className: 'oc-noticeMuted', key: `line-${index}` }, props.lines[index]));
				}
			}
			if (props.extra) children.push(props.extra);
			const className = props.error ? 'oc-notice oc-noticeError' : 'oc-notice';
			return h('div', { className, role: props.error ? 'alert' : undefined }, ...children.filter(Boolean));
		}

		/**
		 * One quota window on a single line: label, meter, exact money, percent
		 * and the reset countdown. The absolute reset time moves into the tooltip
		 * — the countdown is the number that matters at a glance.
		 */
		function WindowRow(props) {
			const { copy, label, window: window_ } = props;
			const value = num(window_.percent);
			const filled = value === undefined ? 0 : Math.max(0, Math.min(1, value / 100));
			const exceeded = window_.status === 'rate-limited' || filled >= 1;
			const unknown = value === undefined && window_.status !== 'ok';
			const remaining = countdown(window_.resetsAt, copy);
			const exact =
				typeof window_.used === 'number' && typeof window_.limit === 'number'
					? `${moneyExact(window_.used)} / ${money(window_.limit)}`
					: undefined;
			const state = exceeded ? copy.statusRateLimited : unknown ? copy.statusUnknown : undefined;
			return h(
				'div',
				{ className: 'oc-window' },
				h('span', { className: 'oc-windowLabel' }, label),
				h(
					'div',
					{
						className: 'oc-bar',
						role: 'progressbar',
						'aria-label': label,
						'aria-valuemin': 0,
						'aria-valuemax': 100,
						'aria-valuenow': Math.round(filled * 1000) / 10,
					},
					h('div', {
						className: exceeded ? 'oc-barFill oc-barFillWarn' : 'oc-barFill',
						style: { width: `${filled * 100}%` },
					}),
				),
				exact ? h('span', { className: 'oc-windowAmount oc-code' }, exact) : h('span', { className: 'oc-windowAmount' }, ''),
				h('span', { className: 'oc-windowValue' }, percent(value)),
				h(
					'span',
					{
						className: exceeded || unknown ? 'oc-windowReset oc-windowResetWarn' : 'oc-windowReset',
						title: `${copy.resets} ${dayTime(window_.resetsAt)}`,
					},
					state ? `${state} · ` : '',
					// A passed reset point already says everything: prefixing it with
					// "resets" would read as "resets reset point passed".
					remaining === undefined || remaining === copy.resetPassed
						? (remaining ?? dayTime(window_.resetsAt))
						: `${copy.resets} ${remaining}`,
				),
			);
		}

		/** Both Go tiers as badges, the one the API named marked in the brand colour. */
		function PlanRow(props) {
			const { copy, plan, planFromApi } = props;
			const badge = (text, active) =>
				h('span', { className: active ? 'oc-badgeActive' : 'oc-badgeMuted', key: text }, text);
			// Both facts matter: which tier is current, and whether the API stated it
			// or the plugin's config did (a config value cannot know about an upgrade).
			const note = planFromApi ? `${copy.planCurrent} · ${copy.planFromApi}` : copy.planCurrent;
			return h(
				'div',
				{ className: 'oc-plan' },
				h('span', { className: 'oc-planLabel' }, copy.plan),
				badge(copy.planGo, plan === 'go'),
				badge(copy.planGoPlus, plan === 'go-plus'),
				plan === undefined
					? h('span', { className: 'oc-planNote', title: copy.planUnsetHint }, copy.planUnset)
					: h('span', { className: 'oc-planNote' }, note),
			);
		}

		function AccountCard(props) {
			const { copy, data } = props;
			const identity = data.identity;
			const hasIdentity = Boolean(identity && (identity.email || identity.userId));
			const kv = [
				Kv(
					copy.identity,
					hasIdentity
						? (identity.email ?? h('span', { className: 'oc-code' }, identity.userId))
						: copy.identityUnknown,
					{ muted: !hasIdentity },
				),
				Kv(copy.key, h('span', { className: 'oc-code' }, data.key ? data.key.masked : '—')),
				Kv(copy.keySource, h('span', { className: 'oc-code' }, data.keySource ?? '—')),
				Kv(copy.route, h('span', { className: 'oc-code' }, data.provider ?? '—')),
				Kv(copy.baseURL, h('span', { className: 'oc-code' }, data.baseURL ?? '—'), { valueHint: data.baseURL }),
				Kv(copy.session, h('span', { className: 'oc-code' }, data.session ?? '—'), { labelHint: copy.sessionNote }),
			];
			return Group({ title: copy.accountTitle }, [
				h('div', { className: 'oc-kv', key: 'kv' }, ...kv.flat()),
				h(PlanRow, { key: 'plan', copy, plan: data.plan, planFromApi: data.planFromApi }),
			]);
		}

		function QuotaCard(props) {
			const { copy, data } = props;
			useNow();
			const usage = data.usage;
			const windows = Array.isArray(data.quotaWindows) ? data.quotaWindows : [];
			const names = {
				rolling: copy.windowRolling,
				weekly: copy.windowWeekly,
				monthly: copy.windowMonthly,
			};
			const rows = windows.map((window_) =>
				h(WindowRow, {
					key: window_.id,
					copy,
					label: names[window_.id] ?? window_.id,
					window: (usage && usage.windows && usage.windows[window_.id]) || {},
				}),
			);
			return Group({ title: copy.quotaTitle, hint: copy.quotaNote }, [
				h('div', { className: 'oc-windows', key: 'windows' }, ...rows),
			]);
		}

		function SpendCard(props) {
			const { copy, data } = props;
			const spend = data.spend;
			const children = [];
			const budget = Array.isArray(data.budgets) && data.budgets.length > 0 ? data.budgets[0] : undefined;
			if (spend === undefined) {
				const exportError = data.errors?.usageExport ?? '';
				const denied = exportError.includes('403') || (data.errors?.budgets ?? '').includes('403');
				children.push(
					h(Notice, {
						key: 'none',
						title: copy.spendUnavailable,
						body: denied ? copy.spendPermission : undefined,
						lines: [data.errors?.budgets, data.errors?.usageExport].filter(Boolean),
					}),
				);
			} else {
				const stats = [
					Stat(
						copy.spendTotal,
						moneyExact(spend.totalCost),
						spend.source === 'usage-export' ? copy.spendSourceExport : copy.spendSourceBudgets,
					),
					Stat(
						copy.budgetLimit,
						typeof spend.limit === 'number'
							? money(spend.limit)
							: budget && typeof budget.limit === 'number'
								? money(budget.limit)
								: copy.budgetUncapped,
						budget && budget.resetsAt ? `${copy.budgetResets} ${day(budget.resetsAt)}` : undefined,
					),
					Stat(
						copy.spendRequests,
						spend.totalRequests === undefined ? '—' : count(spend.totalRequests),
						spend.modelCount > 0 ? fill(copy.modelsShort, { count: spend.modelCount }) : undefined,
					),
					Stat(copy.spendRange, data.usageRange ?? '—', `${copy.spendRows}: ${count(spend.rowCount)}`),
				];
				children.push(h('div', { className: 'oc-stats', key: 'stats' }, ...stats));
				if (Array.isArray(spend.topModels) && spend.topModels.length > 0) {
					const top = spend.topModels
						.slice()
						.sort((a, b) => b.cost - a.cost)
						.slice(0, 8);
					const max = top.length > 0 ? top[0].cost : 0;
					children.push(
						h(
							'div',
							{ className: 'oc-meters', key: 'top' },
							...top.map((row) =>
								h(
									'div',
									{ className: 'oc-meterRow', key: row.model || 'unknown' },
									h('span', { className: 'oc-meterLabel', title: row.model || undefined }, row.model || '—'),
									h(
										'span',
										{ className: 'oc-meterTrack' },
										h('span', {
											className: 'oc-meterFill',
											style: { width: `${ratio(row.cost, max) * 100}%` },
										}),
									),
									h(
										'span',
										{ className: 'oc-meterValue' },
										`${moneyExact(row.cost)} · ${count(row.requests)}`,
									),
								),
							),
						),
					);
				}
				if (budget && budget.exceeded) {
					children.push(h('p', { className: 'oc-rowError', key: 'exc' }, copy.budgetExceeded));
				}
			}
			return Group(
				{
					title: copy.moneyTitle,
					hint: `${copy.noBalanceTitle}：${copy.noBalanceBody}`,
				},
				children,
			);
		}

		function ModelRow(props) {
			const { copy, model } = props;
			const price = model.price;
			const prices = [];
			if (price) {
				// A free model bills $0 on every axis: "in $0.000 out $0.000" is noise,
				// one word is the honest minimum.
				const rates = [price.input, price.output, price.cacheRead, price.cacheWrite].filter(
					(value) => typeof value === 'number',
				);
				if (rates.length > 0 && rates.every((value) => value === 0)) {
					prices.push(h('span', { className: 'oc-price', key: 'free' }, copy.priceFree));
				} else {
					prices.push(h('span', { className: 'oc-price', key: 'in' }, `${copy.priceIn} ${money(price.input, 3)}`));
					prices.push(h('span', { className: 'oc-price', key: 'out' }, `${copy.priceOut} ${money(price.output, 3)}`));
					if (typeof price.cacheRead === 'number' && price.cacheRead > 0) {
						prices.push(h('span', { className: 'oc-price', key: 'cr' }, `${copy.priceCache} ${money(price.cacheRead, 4)}`));
					}
					if (typeof price.cacheWrite === 'number' && price.cacheWrite > 0) {
						prices.push(h('span', { className: 'oc-price', key: 'cw' }, `${copy.priceWrite} ${money(price.cacheWrite, 4)}`));
					}
				}
			}
			// Peak-hour rates: the DeepSeek models bill double inside 01:00-04:00 and
			// 06:00-10:00 UTC on weekdays, so a single "price" would understate them.
			// The table carries the peak row for exactly those models.
			const peak = model.peak;
			if (peak !== undefined) {
				prices.push(
					h(
						'span',
						{ className: 'oc-price', key: 'peak', title: copy.pricePeakHint },
						`${copy.pricePeak} ${money(peak.input, 3)} / ${money(peak.output, 3)}`,
					),
				);
			}
			const catalogued = typeof model.allowance === 'number';
			const allowanceText = model.unlimited
				? copy.unlimited
				: catalogued
					? `${money(model.allowance)}${copy.allowancePerMonth}`
					: copy.uncatalogued;
			const usedRatio =
				typeof model.used === 'number' && catalogued && model.allowance > 0
					? ratio(model.used, model.allowance)
					: undefined;
			/**
			 * Modalities beyond what a route profile can declare. dsh's
			 * `ModelModality` is `text | image`, so audio/video/pdf are shown here
			 * for information only — they cannot be enabled from configuration.
			 */
			const extraInputs = (model.capabilities?.input ?? []).filter(
				(modality) => modality !== 'text' && modality !== 'image',
			);
			const pricesRow = [];
			if (prices.length > 0) {
				pricesRow.push(h('span', { className: 'oc-price', key: 'title' }, `${copy.priceTitle}:`), ...prices);
			}
			if (extraInputs.length > 0) {
				pricesRow.push(
					h(
						'span',
						{ className: 'oc-price', key: 'extras', title: copy.extraInputNote },
						`${copy.extraInput}: ${extraInputs.join(' ')}`,
					),
				);
			}
			return h(
				'div',
				{ className: 'oc-model' },
				h(
					'div',
					{ className: 'oc-modelHead' },
					h('span', { className: 'oc-modelId', title: model.id }, model.id),
					model.name ? h('span', { className: 'oc-modelName' }, model.name) : null,
					model.note ? h('span', { className: 'oc-modelNote' }, model.note) : null,
					h('span', { className: 'oc-spacer' }),
					model.route
						? h(
								'span',
								{
									className: 'oc-badgeMuted oc-code',
									title: `${copy.routeHint} ${model.route.id}`,
								},
								model.route.label,
							)
						: null,
					h('span', { className: 'oc-modelAllowance', title: copy.monthlyAllowance }, allowanceText),
				),
				usedRatio === undefined
					? null
					: h(
							'div',
							{ className: 'oc-modelMeter' },
							h(
								'span',
								{ className: 'oc-meterTrack' },
								h('span', {
									className: usedRatio >= 1 ? 'oc-meterFill oc-meterFillWarn' : 'oc-meterFill',
									style: { width: `${usedRatio * 100}%` },
								}),
							),
							h(
								'span',
								{ className: 'oc-meterValue', title: copy.usedLabel },
								`${moneyExact(model.used)} / ${money(model.allowance)} · ${copy.remaining} ${moneyExact(model.remaining)}`,
							),
						),
				pricesRow.length > 0 ? h('div', { className: 'oc-prices' }, ...pricesRow) : null,
			);
		}

		function ModelsCard(props) {
			const { copy, data } = props;
			const models = Array.isArray(data.models) ? data.models : [];
			const children = [];
			if (models.length === 0) {
				children.push(h('div', { className: 'oc-emptyModels', key: 'none' }, copy.noModels));
			} else {
				children.push(
					h(
						'div',
						{ className: 'oc-models', key: 'list' },
						...models.map((model) => h(ModelRow, { key: model.id, copy, model })),
					),
				);
			}
			if (data.errors?.models) {
				children.push(
					h('p', { className: 'oc-rowError', key: 'err' }, `${copy.modelsError} ${data.errors.models}`),
				);
			}
			return Group(
				{
					title: copy.modelsTitle,
					note: fill(copy.modelsCount, { count: data.modelCount ?? models.length }),
					hint: fill(copy.modelsNote, { baseURL: data.baseURL ?? '' }),
				},
				children,
			);
		}

		//#endregion

		function OpenCodePage() {
			const copy = COPY[languageTag()];
			const account = useAccount();
			const data = account.data;
			const ok = Boolean(data && data.ok);
			const busy = account.status === 'loading' || account.status === 'refreshing';

			const body = [];
			if (account.status === 'loading' && !data) {
				body.push(h('p', { className: 'oc-emptyModels', key: 'loading' }, copy.loading));
			} else if (data && !ok) {
				const missing = data.code === 'MISSING_CREDENTIAL';
				body.push(
					h(Notice, {
						key: 'notice',
						error: !missing,
						title: missing ? copy.missingKey : copy.errorTitle,
						body: data.error ?? copy.empty,
						lines: [data.baseURL ? `${copy.baseURL}: ${data.baseURL}` : undefined, data.apiKeyEnv ? `apiKeyEnv: ${data.apiKeyEnv}` : undefined].filter(Boolean),
						extra: missing ? h('p', { className: 'oc-noticeMuted' }, copy.hint) : null,
					}),
				);
			} else if (data && ok) {
				body.push(h(AccountCard, { key: 'account', copy, data }));
				body.push(h(QuotaCard, { key: 'quota', copy, data }));
				body.push(h(SpendCard, { key: 'spend', copy, data }));
				body.push(h(ModelsCard, { key: 'models', copy, data }));
			} else if (account.error) {
				body.push(h(Notice, { key: 'err', error: true, title: copy.errorTitle, body: account.error }));
			}

			return h(
				'div',
				{ className: 'oc-section', 'data-opencode-account': 'page' },
				h(
					'div',
					{ className: 'oc-header' },
					h('h2', { className: 'oc-title' }, copy.title),
					h(
						'div',
						{ className: 'oc-headerRight' },
						data && data.fetchedAt ? h('span', { className: 'oc-stamp' }, `${copy.updated} ${stamp(data.fetchedAt)}`) : null,
						h(
							'button',
							{
								type: 'button',
								className: 'oc-button',
								title: copy.autoNote,
								disabled: busy,
								onClick: () => {
									void account.reload();
								},
							},
							account.status === 'refreshing' ? copy.refreshing : copy.refresh,
						),
					),
				),
				...body,
				h(
					'div',
					{ className: 'oc-footer' },
					data && data.dashboardURL
						? h(
								'a',
								{ className: 'oc-link', href: data.dashboardURL, target: '_blank', rel: 'noreferrer' },
								copy.openConsole,
							)
						: null,
					h('span', { className: 'oc-spacer' }),
					h('span', { className: 'oc-version' }, `dsh-opencode-account v${PLUGIN_VERSION}`),
				),
			);
		}

		function apply(ctx) {
			if (typeof document !== 'undefined') injectPageCss();
			if (ctx === undefined || ctx.slots === undefined || typeof ctx.slots.inject !== 'function') return;
			ctx.slots.inject('settings.section', () =>
				ctx.slots.register(
					{
						name: 'settings.section',
						id: 'opencode-account',
						order: 15,
						label: () => COPY[languageTag()].nav,
						inject: () => ({}),
					},
					OpenCodePage,
				),
			);
		}

		const inject = ['slots'];

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
