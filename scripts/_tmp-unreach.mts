import Module from 'node:module';
const original = Module.prototype.require;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Module.prototype as any).require = function (id: string) { if (id === 'server-only') return {}; return original.apply(this, [id] as never); };
const { loadDraftSpec } = await import('@/lib/validation/load-spec');
const { buildValidationCtx } = await import('@/lib/validation/context');
const { runValidation } = await import('@/lib/validation/registry');
const spec = await loadDraftSpec();
const issues = runValidation(spec, buildValidationCtx());
for (const i of issues) if (i.code === 'W-REL-007') console.log(' -', i.message);
process.exit(0);
