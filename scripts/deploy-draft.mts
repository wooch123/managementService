/**
 * 초안을 배포한다 — 관리자 화면(/admin/deploy)의 "배포" 버튼과 같은 일을 명령줄에서 한다.
 *
 * 왜 필요한가: 운영 서버의 세션 쿠키는 secure라 로컬 http로는 로그인할 수 없어(SYSTEM.md §8),
 * API를 통한 배포가 막힌다. 배포 파이프라인(`publish()`) 자체는 순수 서버 함수라 여기서 직접
 * 부를 수 있다 — 검증 → 백업 → 스키마 반영 → 리비전 생성 → 활성 리비전 교체를 그대로 거친다.
 *
 * 파괴적 스키마 변경은 인자로 명시해야 통과한다(그대로 두면 배포가 막힌다).
 *
 * 실행: pnpm tsx scripts/deploy-draft.mts "메모"
 */
// tsx는 Next 전용 'server-only'를 해석하지 못한다 — 배포 파이프라인만 돌리기 위해 빈 모듈로 바꾼다.
import Module from 'node:module';
const original = Module.prototype.require;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Module.prototype as any).require = function (id: string) {
  if (id === 'server-only') return {};
  return original.apply(this, [id] as never);
};

const { publish } = await import('@/lib/deploy/publish');

const note = process.argv[2] ?? '명령줄 배포';
const result = await publish({ note, acceptDestructiveIds: [], publishedBy: 'admin' });

if (result.ok) {
  console.log(`배포 완료 — 리비전 #${result.revisionNo}`);
  process.exit(0);
}
console.error(`배포 실패(${result.step}): ${result.message}`);
for (const issue of result.issues ?? []) {
  if (issue.severity === 'error') console.error(`  ${issue.code} ${issue.message}`);
}
process.exit(1);
