import 'server-only';
import { prisma } from '@/lib/db/prisma';

export type AppSettings = { siteTitle: string; siteSubtitle: string };

/** 행이 아직 없으면 스키마 기본값과 같은 값을 돌려준다(첫 저장 때 실제 행이 만들어진다). */
export const DEFAULT_APP_SETTINGS: AppSettings = { siteTitle: 'WebApp_V1', siteSubtitle: 'v1.0.1' };

export async function getAppSettings(): Promise<AppSettings> {
  const row = await prisma.appSetting.findUnique({ where: { id: 'singleton' } });
  return row
    ? { siteTitle: row.siteTitle, siteSubtitle: row.siteSubtitle }
    : DEFAULT_APP_SETTINGS;
}

export async function saveAppSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const row = await prisma.appSetting.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...DEFAULT_APP_SETTINGS, ...patch },
    update: patch,
  });
  return { siteTitle: row.siteTitle, siteSubtitle: row.siteSubtitle };
}
