import 'server-only';
import { prisma } from '@/lib/db/prisma';

/** base가 이미 사용 중이면 -2, -3 ... 을 붙여 유니크한 slug를 만든다. */
export async function resolveUniqueSlug(base: string, excludeId?: string): Promise<string> {
  let candidate = base;
  let suffix = 2;
  while (true) {
    const existing = await prisma.page.findUnique({ where: { slug: candidate } });
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

export async function nextRootOrder(): Promise<number> {
  const last = await prisma.page.findFirst({
    where: { parentId: null },
    orderBy: { order: 'desc' },
  });
  return (last?.order ?? -1) + 1;
}

export async function nextChildOrder(parentId: string): Promise<number> {
  const last = await prisma.page.findFirst({
    where: { parentId },
    orderBy: { order: 'desc' },
  });
  return (last?.order ?? -1) + 1;
}
