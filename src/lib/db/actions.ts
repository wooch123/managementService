import 'server-only';
import { prisma } from '@/lib/db/prisma';

export async function getActionList() {
  return prisma.action.findMany({ orderBy: { createdAt: 'asc' } });
}
