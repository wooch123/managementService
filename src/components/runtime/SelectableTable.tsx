'use client';

import { useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';

/**
 * 목록에서 고른 항목을 **주소에 적는 표**.
 *
 * 청사진의 뼈대는 "왼쪽에서 고르면 오른쪽에 그 항목의 상세·이력·다음 행동이 따라온다"이다
 * (REVIEW.md 공통 진단 ①②). 이걸 만들려면 선택이 페이지 전체에 전달되어야 하는데, 이 앱은
 * 이미 같은 문제를 **조회 기간**에서 풀어 뒀다 — 컴포넌트는 주소만 바꾸고, 서버가 그 주소로
 * 페이지의 모든 바인딩을 다시 조회한다(SYSTEM.md §4.6).
 *
 * 그래서 선택도 같은 길을 쓴다. 행을 누르면 `?sel=FAR-26-4514`가 되고, 상세·이력 패널은
 * 바인딩 필터에 `주소 쿼리(sel)`를 걸어 두기만 하면 된다. 덕분에
 *   - 선택한 화면을 링크로 그대로 공유할 수 있고,
 *   - 뒤로 가기로 이전 선택으로 돌아가며,
 *   - 상세 패널이 클라이언트에서 따로 조회하지 않는다(서버가 한 번에 그린다).
 *
 * 같은 페이지에 표가 둘 이상이면 파라미터 이름(`param`)을 다르게 준다.
 */
export function SelectableTable<TData extends Record<string, unknown>>({
  columns,
  data,
  emptyText,
  showSearch,
  pageSize,
  showExport,
  showCopy,
  exportName,
  param,
  column,
  slug,
}: {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  emptyText: string;
  showSearch: boolean;
  pageSize?: number;
  showExport?: boolean;
  showCopy?: boolean;
  exportName?: string;
  /** 선택값을 담을 주소 파라미터 이름(예: 'sel') */
  param: string;
  /** 선택값으로 쓸 컬럼명(예: 'far_no') — 표시용 이름이 아니라 실제 DB 컬럼명이다. */
  column: string;
  /**
   * 행을 누르면 갈 **다른 화면**. 비우면 지금 화면에서 고른다.
   *
   * 청사진 01의 "행 선택 후 배정·리포트·의뢰 작업으로 바로 이동" — 상세 패널이 없는 화면에서는
   * 행을 눌러도 아무 일이 없는데, 그 목록은 대개 "여기서 무언가를 하려고" 보는 것이다.
   */
  slug?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const current = slug ? '' : (searchParams.get(param) ?? '');

  function select(row: TData) {
    const value = row[column];
    if (value === null || value === undefined) return;
    if (slug) {
      startTransition(() => router.push(`/home/${slug}?${param}=${encodeURIComponent(String(value))}`));
      return;
    }
    const next = new URLSearchParams(searchParams.toString());
    // 같은 행을 다시 누르면 선택을 푼다 — 상세 패널을 닫는 방법이 따로 없으면
    // 한 번 고른 뒤에는 목록만 보는 상태로 돌아갈 수 없다.
    if (String(value) === current) next.delete(param);
    else next.set(param, String(value));
    const query = next.toString();
    // scroll: false — 상세 패널은 대개 표 옆이나 아래에 있어, 맨 위로 튀면 방금 고른 행을 놓친다.
    startTransition(() => router.push(query ? `${window.location.pathname}?${query}` : window.location.pathname, { scroll: false }));
  }

  return (
    <DataTable
      columns={columns}
      data={data}
      emptyText={emptyText}
      showSearch={showSearch}
      pageSize={pageSize}
      showExport={showExport}
      showCopy={showCopy}
      exportName={exportName}
      onRowClick={select}
      isRowSelected={(row) => current !== '' && String(row[column] ?? '') === current}
    />
  );
}
