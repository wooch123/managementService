import { layoutComponents } from '@/lib/registry/catalog/layout';
import { inputComponents } from '@/lib/registry/catalog/input';
import { dataDisplayComponents } from '@/lib/registry/catalog/data-display';
import { navigationComponents } from '@/lib/registry/catalog/navigation';
import { feedbackComponents } from '@/lib/registry/catalog/feedback';
import { actionComponents } from '@/lib/registry/catalog/action';
import { utilityComponents } from '@/lib/registry/catalog/utility';
import { statisticsComponents } from '@/lib/registry/catalog/statistics';
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
