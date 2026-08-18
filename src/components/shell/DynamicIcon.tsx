'use client';

import { DynamicIcon as LucideDynamicIcon } from 'lucide-react/dynamic';
import type { LucideProps } from 'lucide-react';

/**
 * lucide-react 전체(1,500개+)를 정적 import하지 않기 위한 래퍼.
 * lucide-react v1의 공식 `DynamicIcon`을 사용한다 (내부에서 동적 import + 자체 로딩 상태 처리).
 */
export function DynamicIcon({
  name,
  ...props
}: { name: string } & Omit<LucideProps, 'ref'>) {
  return <LucideDynamicIcon name={name as never} {...props} />;
}
