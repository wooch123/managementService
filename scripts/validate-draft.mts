// tsx는 Next 전용 'server-only'를 해석하지 못한다 — 검증 엔진만 돌리기 위해 빈 모듈로 대체한다.
import Module from 'node:module';
const original = Module.prototype.require;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Module.prototype as any).require = function (id: string) {
  if (id === 'server-only') return {};
  return original.apply(this, [id] as never);
};

const { loadDraftSpec } = await import('@/lib/validation/load-spec');
const { buildValidationCtx } = await import('@/lib/validation/context');
const { runValidation } = await import('@/lib/validation/registry');

const spec = await loadDraftSpec();
const issues = runValidation(spec, buildValidationCtx());
const errors = issues.filter((i) => i.severity === 'error');
const warns = issues.filter((i) => i.severity === 'warning');
console.log(`오류 ${errors.length} · 경고 ${warns.length}`);
const group = new Map<string, { n: number; sample: string }>();
for (const i of issues) {
  const g = group.get(i.code) ?? { n: 0, sample: i.message };
  g.n += 1;
  group.set(i.code, g);
}
for (const [code, g] of [...group].sort()) console.log(`  ${code} ×${g.n} — ${g.sample}`);
process.exit(0);
