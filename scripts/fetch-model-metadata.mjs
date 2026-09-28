/**
 * Fetch the authoritative model metadata for the OpenCode Go provider.
 *
 *   node scripts/fetch-model-metadata.mjs
 *
 * Source: https://models.dev/api.json — the catalog the OpenCode ecosystem
 * publishes, which is what the console's feature list is built from. It answers
 * in one request what probing cannot: `modalities.input` (text / image / audio /
 * video / pdf), `reasoning_options`, `limit`, `cost`, `attachment`, `tool_call`,
 * `structured_output`, `temperature`.
 *
 * This replaces guesswork and one-by-one probing as the PRIMARY source:
 *   - probing only ever asked about images, so it could never reveal that
 *     `mimo-v2.5` takes audio or that `glm-5.3-flash` takes PDFs;
 *   - it cost 30 live requests per run, and a single bad answer (the red-image
 *     probe disagrees with this catalog for exactly one model) silently
 *     rewrote a capability.
 *
 * The result is cached next to the plugin so `build-provider-models.mjs` stays
 * offline-capable, and so the numbers a build used remain inspectable.
 *
 * NOTE ON SCOPE: dsh's own `ModelModality` is `text | image` only, so the extra
 * modalities cannot be declared in a route profile. They are recorded here (and
 * surfaced in the account page / README) but the generator writes just the
 * text/image subset. See `VISION_MODALITIES` there.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const SOURCE = 'https://models.dev/api.json';
const PROVIDER = 'opencode-go';

/** Fields worth keeping — the rest of the catalog entry is noise for our use. */
function trim(model) {
	return {
		name: model.name,
		...(model.description === undefined ? {} : { description: model.description }),
		...(model.family === undefined ? {} : { family: model.family }),
		attachment: model.attachment === true,
		reasoning: model.reasoning === true,
		...(model.reasoning_options === undefined ? {} : { reasoning_options: model.reasoning_options }),
		tool_call: model.tool_call === true,
		structured_output: model.structured_output === true,
		temperature: model.temperature === true,
		...(model.knowledge === undefined ? {} : { knowledge: model.knowledge }),
		...(model.release_date === undefined ? {} : { release_date: model.release_date }),
		modalities: {
			input: model.modalities?.input ?? ['text'],
			output: model.modalities?.output ?? ['text'],
		},
		...(model.limit === undefined ? {} : { limit: model.limit }),
		...(model.cost === undefined ? {} : { cost: model.cost }),
	};
}

const res = await fetch(SOURCE, { signal: AbortSignal.timeout(90000) });
if (!res.ok) throw new Error(`GET ${SOURCE} → HTTP ${res.status}`);
const catalog = await res.json();
const provider = catalog[PROVIDER];
if (provider === undefined) throw new Error(`${SOURCE} has no "${PROVIDER}" provider`);

const models = {};
for (const [id, model] of Object.entries(provider.models ?? {})) models[id] = trim(model);

const out = join(root, 'model-metadata.json');
writeFileSync(
	out,
	`${JSON.stringify(
		{
			fetchedAt: new Date().toISOString(),
			source: SOURCE,
			provider: PROVIDER,
			modelCount: Object.keys(models).length,
			models,
		},
		null,
		2,
	)}\n`,
);

const modalities = new Set(Object.values(models).flatMap((m) => m.modalities.input));
console.log(`${PROVIDER}: ${Object.keys(models).length} models → ${out}`);
console.log(`modalities seen in the catalog: ${[...modalities].sort().join(', ')}`);
const multi = Object.entries(models).filter(([, m]) => m.modalities.input.some((x) => x !== 'text' && x !== 'image'));
console.log(`models with modalities dsh cannot declare: ${multi.length}`);
for (const [id, m] of multi.slice(0, 6)) {
	console.log(`  ${id.padEnd(30)} ${m.modalities.input.join('+')}`);
}
