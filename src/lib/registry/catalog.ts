import { layoutComponents } from '@/lib/registry/catalog/layout';
import { inputComponents } from '@/lib/registry/catalog/input';
import { dataDisplayComponents } from '@/lib/registry/catalog/data-display';
import { navigationComponents } from '@/lib/registry/catalog/navigation';
import { feedbackComponents } from '@/lib/registry/catalog/feedback';
import { actionComponents } from '@/lib/registry/catalog/action';
import { utilityComponents } from '@/lib/registry/catalog/utility';
import { statisticsComponents } from '@/lib/registry/catalog/statistics';
import { boardComponents } from '@/lib/registry/catalog/board';
import { workbenchComponents } from '@/lib/registry/catalog/workbench';
import type { ComponentDef, ComponentGroup } from '@/lib/registry/types';
import { COMPONENT_GROUPS } from '@/lib/registry/types';

const allComponents: ComponentDef[] = [
  ...layoutComponents,
  ...inputComponents,
  ...dataDisplayComponents,
  ...navigationComponents,
  ...feedbackComponents,
  ...actionComponents,
  ...utilityComponents,
  ...statisticsComponents,
  ...boardComponents,
  // 운영 화면 청사진(목록→선택 상세)을 이루는 컴포넌트들. 그룹은 각 정의가 스스로 밝히므로
  // 팔레트에서는 기존 그룹(데이터 표시·레이아웃·내비게이션·유틸리티) 안에 함께 놓인다.
  ...workbenchComponents,
];

export const catalog: Record<string, ComponentDef> = Object.fromEntries(
  allComponents.map((def) => [def.key, def])
);

export function getComponentDef(key: string): ComponentDef | undefined {
  return catalog[key];
}

export function getCatalogByGroup(): Record<ComponentGroup, ComponentDef[]> {
  const grouped = Object.fromEntries(COMPONENT_GROUPS.map((g) => [g, [] as ComponentDef[]])) as Record<
    ComponentGroup,
    ComponentDef[]
  >;
  for (const def of allComponents) {
    grouped[def.group].push(def);
  }
  return grouped;
}

export { COMPONENT_GROUPS };
export type { ComponentDef, ComponentGroup } from '@/lib/registry/types';
