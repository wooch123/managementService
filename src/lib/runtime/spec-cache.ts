import 'server-only';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/db/prisma';
import type { PublishedSpec } from '@/types/spec';

/** 리비전 하나의 스펙 JSON을 파싱해 돌려준다. 리비전은 불변이므로 id별로 영구 캐시해도 안전하다. */
function loadRevisionSpec(revisionId: string): Promise<PublishedSpec | null> {
  return unstable_cache(
    async () => {
      const revision = await prisma.revision.findUnique({ where: { id: revisionId } });
      return revision ? (JSON.parse(revision.specJson) as PublishedSpec) : null;
    },
    ['published-spec', revisionId],
    { tags: ['published-spec'] }
  )();
}

/**
 * §12.1 "활성 스펙 로드는 unstable_cache + revalidateTag('published-spec')" — publish()/롤백
 * 둘 다 이 태그를 무효화한다.
 *
 * 다만 **어느 리비전이 활성인지**는 캐시하지 않고 매 요청 DB에서 읽는다(Deployment 한 행 조회).
 * 활성 리비전 포인터까지 같은 캐시 키에 넣었더니, 코드 재빌드 뒤 `.next/cache`에 남아 있던
 * 옛 항목이 되살아나 배포가 끝난 뒤에도 운영 화면이 이전 리비전을 계속 그리는 일이 실제로
 * 발생했다(리비전 10이 활성인데 /home은 7을 렌더). 무거운 건 specJson 파싱이지 포인터
 * 조회가 아니므로, 포인터는 항상 최신을 읽고 스펙 본문만 리비전 id별로 캐시한다.
 */
export async function getActiveSpec(): Promise<PublishedSpec | null> {
  const deployment = await prisma.deployment.findUnique({ where: { id: 'singleton' } });
  if (!deployment?.activeRevisionId) return null;
  return loadRevisionSpec(deployment.activeRevisionId);
}
