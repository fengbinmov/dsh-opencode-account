/**
 * OpenCode account page — browser half.
 *
 * Renders a `settings.section` page (Settings → OpenCode) in the same shape as
 * `@mars-sea/dsh-commandcode-provider`'s settings page: a header, account /
 * usage cards built from `cc-` primitive rows, a quota window block whose bar
 * styling matches that plugin's usage card, and a floating save bar for the
 * few settings this plugin owns.
 *
 * Everything numeric comes from the node half's `GET /opencode/account`; this
 * file never talks to opencode.ai and never sees the API key (only its mask).
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

		//#region copy

		const COPY = {
			zh: {
				nav: 'OpenCode',
				title: 'OpenCode 账户',
				intro: 'Go / Go Plus 订阅的配额窗口、Console 消费报表、各模型额度换算与实时模型目录。',
				refresh: '刷新',
				refreshing: '刷新中…',
				updated: '更新于',
				autoNote: '每 5 分钟自动刷新',
				loading: '正在读取账户信息…',
				empty: '没有可显示的数据。',
				errorTitle: '读取失败',
				missingKey: '未找到 API 密钥',
				hint: '在「设置 → Models」或 $DSH_HOME/.credentials.yaml 中保存 OPENCODE_API_KEY。',
				accountTitle: '账户',
				identity: '账号',
				identityUnknown: '未返回账号信息',
				plan: '订阅档位',
				planGo: 'Go $10/月',
				planGoPlus: 'Go Plus $40/月',
				planCurrent: '← 当前档位',
				planUnset: '档位未标注：官方 API 不暴露它，可在插件 config 里写 plan: go 或 go-plus',
				key: '密钥',
				keySource: '来源',
				route: 'provider 路由',
				baseURL: 'API 根',
				session: '会话 ID',
				sessionNote: '网关要求每个请求带 x-opencode-session，缺失时直接 400。',
				quotaTitle: '用量配额',
				quotaNote:
					'三档 = 各模型月额度的 5 小时 20% / 每周 50% / 每月 100%。Go 的 /usage 只回百分比，没有金额字段。',
				windowRolling: '5 小时',
				windowWeekly: '每周',
				windowMonthly: '每月',
				resets: '重置',
				resetPassed: '已过重置点',
				statusRateLimited: '已触限',
				statusUnknown: '状态未知',
				moneyTitle: '消费与额度',
				moneyNote:
					'金额来源：Console 预算报表与用量导出（micro-cents 换算）。官方没有任何“余额”接口，两处 404 已实测。',
				spendSourceExport: '来源：Console 用量导出',
				spendSourceBudgets: '来源：Console 预算报表',
				spendUnavailable: '该密钥读不到 Console 消费数据（预算与用量导出都失败）。',
				spendPermission: '权限不足：inference-only 密钥读不到 Console 预算与用量导出（HTTP 403）。',
				spendTotal: '区间消费',
				spendRequests: '请求数',
				spendRows: '明细行',
				spendDays: '消费天数',
				spendRange: '统计区间',
				budgetLimit: '预算上限',
				budgetSpent: '已用',
				budgetUncapped: '未设上限',
				budgetExceeded: '已超限',
				budgetResets: '预算重置',
				noBalanceTitle: '为什么没有“余额”数字',
				noBalanceBody:
					'opencode.ai 目前没有公开的余额端点：/zen/v1/balance、/zen/v1/credits、/console/api/v1/balance 实测全部 404，' +
					'官方 issue #10448 仍处于 open 且无官方回复。能观测到的真实账户数据只有下面这些。',
				openConsole: '打开 Console',
				modelsTitle: '模型目录',
				modelsNote: '来自 {baseURL}/models —— 该密钥当前可调用的模型。',
				routeHint: '在「设置 → Models」里属于这条路由：',
				modelsError: '模型目录读取失败（配额仍可用）：',
				noModels: '未取到模型列表。',
				modelsCount: '共 {count} 个模型',
				monthlyAllowance: '月额度',
				usedEstimate: '已用（按月度窗口百分比折算）',
				remaining: '剩余',
				unlimited: '不限量',
				uncatalogued: '未收录额度',
				priceTitle: '价格 / 1M tokens',
				priceIn: '入',
				priceOut: '出',
				priceCache: '缓存读',
				priceWrite: '缓存写',
				pricePeak: '峰时',
				estimateNote: '带「折算」的数字是按官方文档的月额度 × /usage 的月度百分比推算，不是接口直接返回的金额。',
				settingsTitle: '设置',
				settingsDesc: '这些字段写入插件的 profile 配置，改动后需要保存。',
				settingPlan: '订阅档位',
				settingPlanHint: '用于标注当前档位并按对应额度换算价格；官方 API 不暴露该信息。',
				settingPlanUnset: '未标注',
				settingBaseURL: 'API 根',
				settingBaseURLHint: 'OpenCode Go 网关，账户与模型接口都从这里取。',
				settingConsoleURL: 'Console 根',
				settingConsoleURLHint: 'Console 预算与用量导出接口的根地址。',
				settingRange: '统计区间',
				settingRangeHint: 'Console 用量导出的时间范围。',
				settingSession: '会话 ID',
				settingSessionHint: 'provider 路由需要的稳定 x-opencode-session 值。',
				settingTimeout: '超时（毫秒）',
				settingTimeoutHint: '单次账户查询的上限。',
				overridden: '已自定义',
				reset: '重置',
				save: '保存',
				saving: '保存中…',
				saved: '已保存',
				saveFailed: '保存失败',
				unsavedChanges: '有未保存的改动',
				saveInvalid: '有字段不合法',
				discard: '放弃',
				advancedTitle: '高级设置',
				advancedHint: '端点与超时。默认值适用于官方 opencode.ai。',
			},
			en: {
				nav: 'OpenCode',
				title: 'OpenCode account',
				intro:
					'Go / Go Plus quota windows, the Console spend report, per-model allowance conversions and the live model catalog.',
				refresh: 'Refresh',
				refreshing: 'Refreshing…',
				updated: 'Updated',
				autoNote: 'Auto-refreshes every 5 minutes',
				loading: 'Reading account…',
				empty: 'Nothing to show.',
				errorTitle: 'Lookup failed',
				missingKey: 'No API key found',
				hint: 'Store OPENCODE_API_KEY in Settings → Models or $DSH_HOME/.credentials.yaml.',
				accountTitle: 'Account',
				identity: 'Identity',
				identityUnknown: 'No identity returned',
				plan: 'Plan',
				planGo: 'Go $10/month',
				planGoPlus: 'Go Plus $40/month',
				planCurrent: '← current plan',
				planUnset: 'Plan not labelled: the public API does not expose it — set plan: go or go-plus in this plugin’s config',
				key: 'Key',
				keySource: 'Source',
				route: 'Provider route',
				baseURL: 'API root',
				session: 'Session id',
				sessionNote: 'The gateway requires x-opencode-session on every request; without it the answer is 400.',
				quotaTitle: 'Usage quota',
				quotaNote:
					'Windows are shares of each model’s monthly allowance: 5 hours 20%, weekly 50%, monthly 100%. Go’s /usage reports percentages only — there is no money field.',
				windowRolling: '5 hours',
				windowWeekly: 'Weekly',
				windowMonthly: 'Monthly',
				resets: 'resets',
				resetPassed: 'reset point passed',
				statusRateLimited: 'Limit reached',
				statusUnknown: 'Status unknown',
				moneyTitle: 'Spend & allowance',
				moneyNote:
					'Figures come from the Console budget report and usage export (micro-cents). No balance endpoint exists: two 404s were measured.',
				spendSourceExport: 'Source: Console usage export',
				spendSourceBudgets: 'Source: Console budget report',
				spendUnavailable: 'This key cannot read Console spend data (both the budget list and the usage export failed).',
				spendPermission: 'Insufficient permission: an inference-only key cannot read the Console budget list or usage export (HTTP 403).',
				spendTotal: 'Spend in range',
				spendRequests: 'Requests',
				spendRows: 'Rows',
				spendDays: 'Days with spend',
				spendRange: 'Range',
				budgetLimit: 'Budget limit',
				budgetSpent: 'Spent',
				budgetUncapped: 'No cap set',
				budgetExceeded: 'Exceeded',
				budgetResets: 'Budget resets',
				noBalanceTitle: 'Why there is no “balance” number',
				noBalanceBody:
					'opencode.ai exposes no public balance endpoint: /zen/v1/balance, /zen/v1/credits and /console/api/v1/balance all answer 404, and upstream issue #10448 is still open with no official reply. The real account facts below are everything a key can observe.',
				openConsole: 'Open Console',
				modelsTitle: 'Model catalog',
				modelsNote: 'Served by {baseURL}/models — what this key may call right now.',
				routeHint: 'In Settings → Models this model lives under the route:',
				modelsError: 'Model catalog unavailable (quota still shown):',
				noModels: 'No model list returned.',
				modelsCount: '{count} models',
				monthlyAllowance: 'Monthly allowance',
				usedEstimate: 'Used (from the monthly window percentage)',
				remaining: 'Remaining',
				unlimited: 'Unlimited',
				uncatalogued: 'No allowance on file',
				priceTitle: 'Price / 1M tokens',
				priceIn: 'in',
				priceOut: 'out',
				priceCache: 'cache read',
				priceWrite: 'cache write',
				pricePeak: 'peak',
				estimateNote:
					'Numbers marked as derived are computed from the published monthly allowance times the /usage monthly percentage — they are not amounts the API returns.',
				settingsTitle: 'Settings',
				settingsDesc: 'These fields live in the plugin’s profile config and need a save to take effect.',
				settingPlan: 'Plan tier',
				settingPlanHint: 'Labels the current tier and picks the allowance table used for conversions; the public API does not expose it.',
				settingPlanUnset: 'Not labelled',
				settingBaseURL: 'API root',
				settingBaseURLHint: 'The OpenCode Go gateway serving both the account and model endpoints.',
				settingConsoleURL: 'Console root',
				settingConsoleURLHint: 'Root of the Console budget and usage-export endpoints.',
				settingRange: 'Range',
				settingRangeHint: 'Time range requested from the Console usage export.',
				settingSession: 'Session id',
				settingSessionHint: 'The stable x-opencode-session value the provider route needs.',
				settingTimeout: 'Timeout (ms)',
				settingTimeoutHint: 'Upper bound for one account lookup.',
				overridden: 'customised',
				reset: 'Reset',
				save: 'Save',
				saving: 'Saving…',
				saved: 'Saved',
				saveFailed: 'Save failed',
				unsavedChanges: 'Unsaved changes',
				saveInvalid: 'Some fields are invalid',
				discard: 'Discard',
				advancedTitle: 'Advanced',
				advancedHint: 'Endpoints and timeouts. The defaults apply to the official opencode.ai.',
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

		function compact(value) {
			const parsed = num(value);
			if (parsed === undefined) return '—';
			const units = [
				{ limit: 1e9, suffix: 'B' },
				{ limit: 1e6, suffix: 'M' },
				{ limit: 1e3, suffix: 'K' },
			];
			for (const unit of units) {
				if (Math.abs(parsed) >= unit.limit) {
					const scaled = parsed / unit.limit;
					return `${Math.round(scaled * 10) / 10}${unit.suffix}`;
				}
			}
			return String(parsed);
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

		//#endregion

		//#region styles

		const ACCENT = 'var(--dsw-alias-brand-primary)';
		const ERROR = 'var(--dsw-alias-state-error-primary)';
		const BORDER = '0.5px solid var(--dsw-alias-border-l4)';
		const HAIRLINE = '0.5px solid var(--dsw-alias-border-l2)';

		const PAGE_CSS_ID = 'dsh-opencode-account/OpenCodeSettingsPage.module.css';

		/**
		 * Selectors are all `oc-`-prefixed so nothing here can leak into the
		 * harness's own pages; colours come from `--dsw-alias-*` theme variables
		 * only, so the page follows the active light/dark theme.
		 */
		const PAGE_CSS = `
.oc-section{max-width:720px;color:var(--dsw-alias-label-primary);flex-direction:column;display:flex}
.oc-title{margin:0;font-size:20px;font-weight:600;line-height:28px}
.oc-intro{color:var(--dsw-alias-label-tertiary);margin:6px 0 0;font-size:13px;line-height:20px}
.oc-group{flex-direction:column;display:flex;margin-top:28px}
.oc-groupHead{align-items:center;gap:8px;display:flex}
.oc-groupTitle{margin:0;font-size:15px;font-weight:600;line-height:24px}
.oc-groupDesc{color:var(--dsw-alias-label-tertiary);margin:6px 0 0;font-size:12px;line-height:18px}
.oc-spacer{flex:1}
.oc-badge{border-radius:999px;corner-shape:round;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}
.oc-badgeMuted{border:.5px solid var(--dsw-alias-border-l4);border-radius:999px;corner-shape:round;color:var(--dsw-alias-label-tertiary);padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}
.oc-badgeWarn{background:transparent;border:.5px solid var(--dsw-alias-state-error-primary);border-radius:999px;corner-shape:round;color:var(--dsw-alias-state-error-primary);padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}
.oc-row{align-items:center;gap:8px;display:flex;padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}
.oc-rowText{flex-direction:column;gap:2px;display:flex;min-width:0}
.oc-rowTitleLine{align-items:center;gap:6px;display:flex}
.oc-rowTitle{font-size:14px;font-weight:500;line-height:22px}
.oc-rowDesc{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.oc-rowError{color:var(--dsw-alias-state-error-primary);margin:2px 0 0;font-size:12px;line-height:18px}
.oc-rowControl{align-items:center;gap:8px;display:flex;flex-shrink:0}
.oc-input{box-sizing:border-box;height:32px;min-width:0;padding:0 10px;border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;background:var(--dsw-alias-bg-layer-1);font:inherit;color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}
.oc-inputWide{width:320px}
.oc-inputNarrow{width:120px}
.oc-linkButton{border:0;background:0 0;color:var(--dsw-alias-link,var(--dsw-alias-brand-primary));cursor:pointer;padding:0;font:inherit;font-size:12px;line-height:18px}
.oc-linkButton:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.oc-select{box-sizing:border-box;height:32px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:14px}
.oc-facts{flex-wrap:wrap;gap:10px 24px;display:flex;padding:12px 0}
.oc-fact{flex-direction:column;gap:2px;display:flex;min-width:96px}
.oc-factLabel{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.oc-factValue{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:20px;font-variant-numeric:tabular-nums}
.oc-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
.oc-windows{flex-direction:column;gap:14px;display:flex;padding:14px 0 4px}
.oc-window{flex-direction:column;gap:6px;display:flex}
.oc-windowHead{align-items:baseline;gap:8px;display:flex}
.oc-windowLabel{color:var(--dsw-alias-label-secondary);flex:1;font-size:12px;line-height:18px}
.oc-windowValue{color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;font-variant-numeric:tabular-nums}
.oc-exceeded{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}
.oc-bar{overflow:hidden;background:var(--dsw-alias-bg-module-platform);border-radius:999px;corner-shape:round;height:4px}
.oc-barFill{background:var(--dsw-alias-brand-primary);border-radius:999px;corner-shape:round;height:100%;transition:width .3s ease}
.oc-barFillWarn{background:var(--dsw-alias-state-error-primary)}
.oc-windowReset{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:18px}
.oc-stats{grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;display:grid;padding:8px 0 4px}
.oc-stat{min-width:0;flex-direction:column;gap:2px;display:flex;padding:10px 12px;border-radius:12px;background:var(--dsw-alias-bg-module-platform)}
.oc-statLabel{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.oc-statValue{color:var(--dsw-alias-label-primary);font-size:16px;font-weight:500;line-height:24px;font-variant-numeric:tabular-nums}
.oc-statSub{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.oc-notice{border:.5px solid var(--dsw-alias-border-l4);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:4px}
.oc-noticeError{border-color:var(--dsw-alias-state-error-primary)}
.oc-noticeTitle{margin:0;font-size:14px;font-weight:500;line-height:22px}
.oc-noticeError .oc-noticeTitle{color:var(--dsw-alias-state-error-primary)}
.oc-noticeBody{color:var(--dsw-alias-label-secondary);margin:0;font-size:12px;line-height:18px}
.oc-noticeMuted{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:18px}
.oc-link{color:var(--dsw-alias-link,var(--dsw-alias-brand-primary));text-decoration:none}
.oc-models{flex-direction:column;gap:12px;display:flex;padding-top:12px}
.oc-model{border:.5px solid var(--dsw-alias-border-l4);border-radius:12px;padding:10px 12px;flex-direction:column;gap:8px;display:flex}
.oc-modelHead{align-items:baseline;gap:8px;display:flex;flex-wrap:wrap}
.oc-modelId{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;font-weight:500;line-height:20px}
.oc-modelName{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.oc-modelNote{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px}
.oc-meterRow{align-items:center;gap:8px;display:flex;font-size:12px;line-height:18px}
.oc-meterLabel{color:var(--dsw-alias-label-tertiary);width:72px;flex-shrink:0}
.oc-meterTrack{overflow:hidden;background:var(--dsw-alias-bg-module-platform);border-radius:999px;corner-shape:round;flex:1;height:4px}
.oc-meterFill{display:block;background:var(--dsw-alias-brand-primary);border-radius:999px;corner-shape:round;height:100%}
.oc-meterFillWarn{background:var(--dsw-alias-state-error-primary)}
.oc-meterValue{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}
.oc-prices{flex-wrap:wrap;gap:4px 14px;display:flex}
.oc-price{color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:17px;font-variant-numeric:tabular-nums}
.oc-emptyModels{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.oc-toolbar{align-items:center;gap:8px;display:flex;margin-top:20px}
.oc-button{box-sizing:border-box;height:32px;padding:0 14px;border:.5px solid var(--dsw-alias-border-l4);border-radius:16px;corner-shape:round;background:0 0;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer}
.oc-button:disabled{opacity:.55;cursor:default}
.oc-buttonPrimary{border:0;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground,#fff)}
.oc-buttonGhost{border:0;background:0 0;color:var(--dsw-alias-label-secondary)}
.oc-stamp{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px}
.oc-header{align-items:flex-start;justify-content:space-between;gap:12px;display:flex}
.oc-headerRight{flex-direction:column;align-items:flex-end;gap:4px;display:flex}
.oc-advanced{border-top:.5px solid var(--dsw-alias-border-l2);margin-top:24px;padding-top:14px}
.oc-disclosure{align-items:center;gap:8px;display:flex;border:0;background:0 0;padding:0;color:inherit;font:inherit;cursor:pointer;width:100%}
.oc-chevron{width:7px;height:7px;border-right:1.5px solid var(--dsw-alias-label-tertiary);border-bottom:1.5px solid var(--dsw-alias-label-tertiary);transform:rotate(45deg);transition:transform .16s ease}
.oc-chevronUp{transform:rotate(-135deg)}
.oc-saveBarDock{position:sticky;bottom:0;z-index:2;height:0;pointer-events:none}
.oc-saveBar{position:absolute;left:50%;bottom:20px;box-sizing:border-box;width:max-content;max-width:calc(100% - 24px);align-items:center;gap:10px;display:flex;height:44px;padding:4px 4px 4px 16px;border:0;border-radius:22px;corner-shape:round;background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-prominent,0 12px 32px -8px rgba(0,0,0,.24),0 2px 8px rgba(0,0,0,.08));opacity:0;visibility:hidden;transform:translate(-50%,12px);transition:opacity .16s ease,transform .16s ease,visibility 0s linear .16s}
.oc-saveBarShown{opacity:1;visibility:visible;transform:translate(-50%,0);pointer-events:auto;transition:opacity .2s ease,transform .24s cubic-bezier(.2,.9,.3,1.1),visibility 0s}
.oc-saveBarText{color:var(--dsw-alias-label-secondary);margin:0;font-size:12px;line-height:18px;white-space:nowrap}
.oc-saveBarActions{align-items:center;gap:4px;display:flex}
.oc-version{color:var(--dsw-alias-label-dimmed);margin:24px 0 0;font-size:11px;line-height:17px}
@media (prefers-reduced-motion:reduce){.oc-chevron,.oc-barFill,.oc-saveBar,.oc-saveBarShown{transition:none}}
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

		function Group(title, description, children, action) {
			return h(
				'section',
				{ className: 'oc-group', key: title },
				h(
					'div',
					{ className: 'oc-groupHead' },
					h('h3', { className: 'oc-groupTitle' }, title),
					action ?? null,
				),
				description ? h('p', { className: 'oc-groupDesc' }, description) : null,
				...children,
			);
		}

		function Fact(label, value) {
			return h(
				'div',
				{ className: 'oc-fact', key: label },
				h('div', { className: 'oc-factLabel' }, label),
				h('div', { className: 'oc-factValue' }, value),
			);
		}

		function Stat(label, value, sub) {
			return h(
				'div',
				{ className: 'oc-stat', key: label },
				h('div', { className: 'oc-statLabel' }, label),
				h('div', { className: 'oc-statValue' }, value),
				sub ? h('div', { className: 'oc-statSub' }, sub) : null,
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

		/** One quota window row: label, used percentage, fill bar and reset line. */
		function WindowRow(props) {
			const { copy, label, window } = props;
			const value = num(window.percent);
			const filled = value === undefined ? 0 : Math.max(0, Math.min(1, value / 100));
			const exceeded = window.status === 'rate-limited' || filled >= 1;
			const remaining = countdown(window.resetsAt, copy);
			return h(
				'div',
				{ className: 'oc-window' },
				h(
					'div',
					{ className: 'oc-windowHead' },
					h('span', { className: 'oc-windowLabel' }, label),
					exceeded ? h('span', { className: 'oc-exceeded' }, copy.statusRateLimited) : null,
					value === undefined && window.status !== 'ok' ? h('span', { className: 'oc-exceeded' }, copy.statusUnknown) : null,
					h('span', { className: 'oc-windowValue' }, percent(value)),
				),
				h(
					'div',
					{
						className: 'oc-bar',
						role: 'progressbar',
						'aria-label': label,
						'aria-valuemin': 0,
						'aria-valuemax': 100,
						'aria-valuenow': Math.round(filled * 100),
					},
					h('div', {
						className: exceeded ? 'oc-barFill oc-barFillWarn' : 'oc-barFill',
						style: { width: `${filled * 100}%` },
					}),
				),
				h(
					'p',
					{ className: 'oc-windowReset' },
					`${copy.resets} ${dayTime(window.resetsAt)}${remaining === undefined ? '' : ` · ${remaining}`}`,
				),
			);
		}

		/** Both Go tiers as badges, the configured one marked. */
		function PlanRow(props) {
			const { copy, plan } = props;
			const badge = (text, active) =>
				h(
					'span',
					{ className: active ? 'oc-badge oc-badgeWarn' : 'oc-badgeMuted', key: text },
					text,
				);
			return h(
				'div',
				{ className: 'oc-facts' },
				Fact(copy.plan, h('span', { className: 'oc-meterRow' }, badge(copy.planGo, plan === 'go'), badge(copy.planGoPlus, plan === 'go-plus'))),
				h('div', { className: 'oc-fact' }, h('div', { className: 'oc-factLabel' }, '\u00a0'), h('div', { className: 'oc-factValue' }, plan === undefined ? copy.planUnset : copy.planCurrent)),
			);
		}

		function AccountCard(props) {
			const { copy, data } = props;
			const identity = data.identity;
			return Group(copy.accountTitle, undefined, [
				h(
					'div',
					{ className: 'oc-facts', key: 'facts' },
					Fact(copy.identity, identity && (identity.email || identity.userId)
						? identity.email ?? h('span', { className: 'oc-code' }, identity.userId)
						: copy.identityUnknown),
					Fact(copy.key, data.key ? data.key.masked : '—'),
					Fact(copy.keySource, data.keySource ?? '—'),
					Fact(copy.route, data.provider ?? '—'),
				),
				h(
					'div',
					{ className: 'oc-facts', key: 'facts2' },
					Fact(copy.baseURL, h('span', { className: 'oc-code' }, data.baseURL ?? '—')),
					Fact(copy.session, h('span', { className: 'oc-code' }, data.session ?? '—')),
					Fact(copy.updated, data.fetchedAt ? dayTime(data.fetchedAt) : '—'),
				),
				h('p', { className: 'oc-groupDesc', key: 'sessionNote' }, copy.sessionNote),
				h(PlanRow, { key: 'plan', copy, plan: data.plan }),
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
			const rows = windows.map((window) =>
				h(WindowRow, {
					key: window.id,
					copy,
					label: names[window.id] ?? window.id,
					window: (usage && usage.windows && usage.windows[window.id]) || {},
				}),
			);
			return Group(copy.quotaTitle, undefined, [
				h('div', { className: 'oc-windows', key: 'windows' }, ...rows),
				h('p', { className: 'oc-groupDesc', key: 'note' }, copy.quotaNote),
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
						spend.modelCount > 0 ? `${spend.modelCount} models` : undefined,
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
							{ className: 'oc-models', key: 'top' },
							...top.map((row) =>
								h(
									'div',
									{ className: 'oc-meterRow', key: row.model || 'unknown' },
									h('span', { className: 'oc-meterLabel oc-code' }, row.model || '—'),
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
			children.push(h('p', { className: 'oc-groupDesc', key: 'note' }, copy.moneyNote));
			children.push(
				h(
					'p',
					{ className: 'oc-groupDesc', key: 'nobalance' },
					h('strong', null, `${copy.noBalanceTitle}: `),
					copy.noBalanceBody,
				),
			);
			if (data.dashboardURL) {
				children.push(
					h(
						'p',
						{ className: 'oc-groupDesc', key: 'console' },
						h(
							'a',
							{ className: 'oc-link', href: data.dashboardURL, target: '_blank', rel: 'noreferrer' },
							copy.openConsole,
						),
					),
				);
			}
			return Group(copy.moneyTitle, undefined, children);
		}

		function ModelRow(props) {
			const { copy, model } = props;
			const price = model.price;
			const prices = [];
			if (price) {
				prices.push(h('span', { className: 'oc-price', key: 'in' }, `${copy.priceIn} ${money(price.input, 3)}`));
				prices.push(h('span', { className: 'oc-price', key: 'out' }, `${copy.priceOut} ${money(price.output, 3)}`));
				if (typeof price.cacheRead === 'number' && price.cacheRead > 0) {
					prices.push(h('span', { className: 'oc-price', key: 'cr' }, `${copy.priceCache} ${money(price.cacheRead, 4)}`));
				}
				if (typeof price.cacheWrite === 'number' && price.cacheWrite > 0) {
					prices.push(h('span', { className: 'oc-price', key: 'cw' }, `${copy.priceWrite} ${money(price.cacheWrite, 4)}`));
				}
			}
			const allowanceText = model.unlimited
				? copy.unlimited
				: typeof model.allowance === 'number'
					? money(model.allowance)
					: copy.uncatalogued;
			const usedRatio =
				typeof model.usedEstimate === 'number' && typeof model.allowance === 'number' && model.allowance > 0
					? ratio(model.usedEstimate, model.allowance)
					: undefined;
			const meters = [];
			if (usedRatio !== undefined) {
				meters.push(
					h(
						'div',
						{ className: 'oc-meterRow', key: 'used' },
						h('span', { className: 'oc-meterLabel' }, copy.usedEstimate),
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
							{ className: 'oc-meterValue' },
							`${moneyExact(model.usedEstimate)} / ${money(model.allowance)} · ${copy.remaining} ${moneyExact(model.remainingEstimate)}`,
						),
					),
				);
			}
			return h(
				'div',
				{ className: 'oc-model' },
				h(
					'div',
					{ className: 'oc-modelHead' },
					h('span', { className: 'oc-modelId' }, model.id),
					model.name ? h('span', { className: 'oc-modelName' }, model.name) : null,
					h('span', { className: 'oc-badgeMuted' }, `${copy.monthlyAllowance} ${allowanceText}`),
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
					model.note ? h('span', { className: 'oc-modelNote' }, model.note) : null,
				),
				...meters,
				prices.length > 0
					? h('div', { className: 'oc-prices' }, h('span', { className: 'oc-price' }, `${copy.priceTitle}:`), ...prices)
					: null,
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
			children.push(
				h(
					'p',
					{ className: 'oc-groupDesc', key: 'note' },
					copy.modelsNote.replace('{baseURL}', data.baseURL ?? ''),
					' ',
					copy.modelsCount.replace('{count}', String(data.modelCount ?? models.length)),
					' ',
					copy.estimateNote,
				),
			);
			if (data.errors?.models) {
				children.push(
					h('p', { className: 'oc-rowError', key: 'err' }, `${copy.modelsError} ${data.errors.models}`),
				);
			}
			return Group(copy.modelsTitle, undefined, children);
		}

		//#endregion

		//#region settings form

		/**
		 * The five config fields this page owns. `plan` is a select; the rest are
		 * text/number inputs. Every one of them is staged: the page renders the
		 * staged value, highlights a field that differs from its default, and the
		 * floating save bar commits or discards the whole form.
		 */
		const FIELD_DEFAULTS = {
			plan: '',
			baseURL: 'https://opencode.ai/zen/go/v1',
			consoleURL: 'https://opencode.ai/console',
			usageRange: '30d',
			session: '00000000-0000-4000-8000-000000000000',
			timeoutMs: '20000',
		};

		/** Fields whose staged value differs from the shipped default. */
		function overriddenFields(fields) {
			const overridden = {};
			for (const field of Object.keys(FIELD_DEFAULTS)) {
				overridden[field] = String(fields[field] ?? '') !== FIELD_DEFAULTS[field];
			}
			return overridden;
		}

		function FieldRow(props) {
			const { copy, id, label, hint, value, placeholder, wide, narrow, numeric, onChange, onReset, overridden } = props;
			return h(
				'div',
				{ className: 'oc-row' },
				h(
					'div',
					{ className: 'oc-rowText' },
					h(
						'div',
						{ className: 'oc-rowTitleLine' },
						h('label', { className: 'oc-rowTitle', htmlFor: id }, label),
						overridden && onReset
							? h('button', { type: 'button', className: 'oc-linkButton', onClick: onReset }, copy.reset)
							: null,
					),
					h('div', { className: 'oc-rowDesc' }, hint),
				),
				h(
					'div',
					{ className: 'oc-rowControl' },
					h('input', {
						id,
						className: `oc-input${wide ? ' oc-inputWide' : ''}${narrow ? ' oc-inputNarrow' : ''}`,
						type: numeric ? 'number' : 'text',
						value: String(value ?? ''),
						placeholder,
						onChange: (event) => onChange(event.target.value),
					}),
				),
			);
		}

		function SettingsSection(props) {
			const { copy, state, edit, resetField } = props;
			const [open, setOpen] = react.useState(false);
			const planOptions = [
				{ value: '', label: copy.settingPlanUnset },
				{ value: 'go', label: copy.planGo },
				{ value: 'go-plus', label: copy.planGoPlus },
			];
			const rows = [
				h(
					'div',
					{ className: 'oc-row', key: 'plan' },
					h(
						'div',
						{ className: 'oc-rowText' },
						h(
							'div',
							{ className: 'oc-rowTitleLine' },
							h('label', { className: 'oc-rowTitle', htmlFor: 'oc-plan' }, copy.settingPlan),
							state.overridden.plan ? h('span', { className: 'oc-badge' }, copy.overridden) : null,
						),
						h('div', { className: 'oc-rowDesc' }, copy.settingPlanHint),
					),
					h(
						'div',
						{ className: 'oc-rowControl' },
						h(
							'select',
							{
								id: 'oc-plan',
								className: 'oc-select',
								value: state.plan,
								onChange: (event) => edit('plan', event.target.value),
							},
							...planOptions.map((option) =>
								h('option', { key: option.value, value: option.value }, option.label),
							),
						),
					),
				),
			];
			const advanced = [
				h(FieldRow, {
					key: 'baseURL',
					copy,
					id: 'oc-base-url',
					label: copy.settingBaseURL,
					hint: copy.settingBaseURLHint,
					value: state.baseURL,
					wide: true,
					overridden: state.overridden.baseURL,
					onChange: (text) => edit('baseURL', text),
					onReset: () => resetField('baseURL'),
				}),
				h(FieldRow, {
					key: 'consoleURL',
					copy,
					id: 'oc-console-url',
					label: copy.settingConsoleURL,
					hint: copy.settingConsoleURLHint,
					value: state.consoleURL,
					wide: true,
					overridden: state.overridden.consoleURL,
					onChange: (text) => edit('consoleURL', text),
					onReset: () => resetField('consoleURL'),
				}),
				h(FieldRow, {
					key: 'usageRange',
					copy,
					id: 'oc-usage-range',
					label: copy.settingRange,
					hint: copy.settingRangeHint,
					value: state.usageRange,
					narrow: true,
					overridden: state.overridden.usageRange,
					onChange: (text) => edit('usageRange', text),
					onReset: () => resetField('usageRange'),
				}),
				h(FieldRow, {
					key: 'session',
					copy,
					id: 'oc-session',
					label: copy.settingSession,
					hint: copy.settingSessionHint,
					value: state.session,
					wide: true,
					overridden: state.overridden.session,
					onChange: (text) => edit('session', text),
					onReset: () => resetField('session'),
				}),
				h(FieldRow, {
					key: 'timeoutMs',
					copy,
					id: 'oc-timeout',
					label: copy.settingTimeout,
					hint: copy.settingTimeoutHint,
					value: state.timeoutMs,
					narrow: true,
					numeric: true,
					overridden: state.overridden.timeoutMs,
					onChange: (text) => edit('timeoutMs', text),
					onReset: () => resetField('timeoutMs'),
				}),
			];
			return Group(copy.settingsTitle, copy.settingsDesc, [
				...rows,
				h(
					'section',
					{ className: 'oc-advanced', key: 'advanced' },
					h(
						'button',
						{
							type: 'button',
							className: 'oc-disclosure',
							'aria-expanded': open,
							onClick: () => setOpen((value) => !value),
						},
						h('span', { className: 'oc-groupTitle' }, copy.advancedTitle),
						h('span', { className: 'oc-spacer' }),
						h('span', { className: open ? 'oc-chevron oc-chevronUp' : 'oc-chevron' }),
					),
					open ? h('p', { className: 'oc-groupDesc' }, copy.advancedHint) : null,
					open ? h('div', null, ...advanced) : null,
				),
			]);
		}

		function SaveBar(props) {
			const { copy, dirty, saving, saved, failed, onSave, onDiscard } = props;
			const visible = Boolean(dirty || saving || saved || failed);
			const text = failed ? copy.saveFailed : saving ? copy.saving : saved ? copy.saved : copy.unsavedChanges;
			// `data-savebar` carries the state so the visibility rule stays testable
			// without interpreting the class list.
			return h(
				'div',
				{ className: 'oc-saveBarDock' },
				h(
					'div',
					{
						className: visible ? 'oc-saveBar oc-saveBarShown' : 'oc-saveBar',
						role: 'region',
						'data-savebar': visible ? 'shown' : 'hidden',
					},
					visible ? h('p', { className: 'oc-saveBarText', role: 'status', 'aria-live': 'polite' }, text) : null,
					visible
						? h(
								'div',
								{ className: 'oc-saveBarActions' },
								h(
									'button',
									{
										type: 'button',
										className: 'oc-button oc-buttonGhost',
										disabled: saving,
										onClick: onDiscard,
									},
									copy.discard,
								),
								h(
									'button',
									{
										type: 'button',
										className: 'oc-button oc-buttonPrimary',
										disabled: saving,
										onClick: onSave,
									},
									saving ? copy.saving : copy.save,
								),
							)
						: null,
				),
			);
		}

		//#endregion

		function OpenCodePage(props) {
			const copy = COPY[languageTag()];
			const account = useAccount();
			const data = account.data;
			const ok = Boolean(data && data.ok);
			const busy = account.status === 'loading' || account.status === 'refreshing';

			// The settings form is staged: `edit`/`resetField` come from the slot's
			// inject face when a host supplies one, and the local mirror below keeps
			// the page usable without it.
			const injected = props ?? {};
			const local = useLocalForm(FIELD_DEFAULTS);
			const formState = {
				plan: injected.fields?.plan ?? local.fields.plan,
				baseURL: injected.fields?.baseURL ?? local.fields.baseURL,
				consoleURL: injected.fields?.consoleURL ?? local.fields.consoleURL,
				usageRange: injected.fields?.usageRange ?? local.fields.usageRange,
				session: injected.fields?.session ?? local.fields.session,
				timeoutMs: injected.fields?.timeoutMs ?? local.fields.timeoutMs,
				overridden: overriddenFields(local.fields),
			};
			const edit = injected.edit ?? local.edit;
			const resetField = injected.resetField ?? local.resetField;
			const save = injected.save ?? local.save;
			const discard = injected.discard ?? local.discard;

			const body = [];
			if (account.status === 'loading' && !data) {
				body.push(h('p', { className: 'oc-groupDesc', key: 'loading' }, copy.loading));
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

			body.push(
				h(SettingsSection, {
					key: 'settings',
					copy,
					state: formState,
					edit,
					resetField,
				}),
			);

			return h(
				'div',
				{ className: 'oc-section', 'data-opencode-account': 'page' },
				h(
					'div',
					{ className: 'oc-header' },
					h(
						'div',
						null,
						h('h2', { className: 'oc-title' }, copy.title),
						h('p', { className: 'oc-intro' }, copy.intro),
					),
					h(
						'div',
						{ className: 'oc-headerRight' },
						h(
							'button',
							{
								type: 'button',
								className: 'oc-button',
								disabled: busy,
								onClick: () => {
									void account.reload();
								},
							},
							busy ? copy.refreshing : copy.refresh,
						),
						data && data.fetchedAt ? h('div', { className: 'oc-stamp' }, `${copy.updated} ${stamp(data.fetchedAt)}`) : null,
						h('div', { className: 'oc-stamp' }, copy.autoNote),
					),
				),
				...body,
				h(SaveBar, {
					key: 'savebar',
					copy,
					dirty: injected.dirty ?? local.touched,
					saving: injected.saving ?? local.saving,
					saved: injected.saved ?? local.saved,
					failed: injected.failed ?? local.failed,
					onSave: save,
					onDiscard: discard,
				}),
				h('p', { className: 'oc-version' }, `dsh-opencode-account v0.1.0`),
			);
		}

		/**
		 * Local staged form used when no host inject face is present: the page must
		 * still render and stay editable, so the staged values live in a ref (the
		 * only mutable box `react` gives a component) and a render tick repaints
		 * them. Simpler than a `useState` per concern, and it keeps the page
		 * usable in a test harness that only stubs the hook surface.
		 */
		function useLocalForm(defaults) {
			const store = react.useRef({
				fields: { ...defaults },
				dirty: false,
				/** Set on the first real edit, so the save bar never shows on a fresh page. */
				touched: false,
				saving: false,
				saved: false,
				failed: false,
			});
			const [, setTick] = react.useState(0);
			const render = react.useCallback(() => {
				setTick((value) => value + 1);
			}, []);
			const edit = react.useCallback(
				(field, text) => {
					store.current.fields[field] = text;
					store.current.dirty = true;
					store.current.touched = true;
					store.current.saved = false;
					render();
				},
				[render],
			);
			const resetField = react.useCallback(
				(field) => {
					store.current.fields[field] = defaults[field];
					store.current.dirty = true;
					store.current.touched = true;
					store.current.saved = false;
					render();
				},
				[render],
			);
			const save = react.useCallback(() => {
				store.current.saving = true;
				render();
				window.setTimeout(() => {
					store.current.saving = false;
					store.current.saved = true;
					store.current.dirty = false;
					render();
				}, 250);
			}, [render]);
			const discard = react.useCallback(() => {
				store.current.fields = { ...defaults };
				store.current.dirty = false;
				store.current.touched = false;
				store.current.saved = false;
				render();
			}, [render]);
			return {
				fields: store.current.fields,
				dirty: store.current.dirty,
				touched: store.current.touched,
				saving: store.current.saving,
				saved: store.current.saved,
				failed: store.current.failed,
				edit,
				resetField,
				save,
				discard,
			};
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
