'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleX,
  Info,
  ListChecks,
  Loader2,
  RefreshCw,
  Search,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Input } from '@/components/ui/input';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { apiCall } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { ValidationIssue, ValidationSeverity, ValidationCategory } from '@/lib/validation/types';

const CATEGORY_LABEL: Record<ValidationCategory, string> = {
  structure: '구조',
  data: '데이터',
  action: '동작',
  relation: '관계',
  deploy: '배포 안전성',
};
const CATEGORY_ORDER: ValidationCategory[] = ['structure', 'data', 'action', 'relation', 'deploy'];
const SEVERITY_LABEL: Record<ValidationSeverity, string> = { error: '오류', warning: '경고', info: '정보' };
const SEVERITY_ORDER: ValidationSeverity[] = ['error', 'warning', 'info'];

type RunSummary = {
  id: string;
  startedAt: Date | string;
  errorCount: number;
  warnCount: number;
};

/** §8.5 "대상 링크" — COMPONENT/FIELD는 자기 id만으로는 URL을 못 만들어 페이지에서 내려준
 * 조회 맵이 필요하다. ACTION/RELATION은 관계도 화면에서 노드/엣지 선택으로 연결한다. */
function targetHref(issue: ValidationIssue, nodePageMap: Record<string, string>, fieldEntityMap: Record<string, string>): string | null {
  const { type, id } = issue.target;
  switch (type) {
    case 'PAGE':
      return `/admin/builder?pageId=${id}`;
    case 'COMPONENT': {
      const pageId = nodePageMap[id];
      return pageId ? `/admin/builder?pageId=${pageId}&nodeId=${id}` : null;
    }
    case 'ENTITY':
      return `/admin/data?entityId=${id}`;
    case 'FIELD': {
      const entityId = fieldEntityMap[id];
      return entityId ? `/admin/data?entityId=${entityId}` : null;
    }
    case 'ACTION':
      return `/admin/graph?nodeId=${id}`;
    case 'RELATION':
      return `/admin/graph?edgeId=${id}`;
    default:
      return null;
  }
}

function SeverityBadge({ severity }: { severity: ValidationSeverity }) {
  if (severity === 'error') return <Badge variant="destructive">오류</Badge>;
  if (severity === 'warning') return <Badge className="border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400">경고</Badge>;
  return <Badge variant="secondary">정보</Badge>;
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        {icon}
        <div>
          <div className="text-xl leading-none font-semibold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ValidateShell({
  initialRun,
  initialIssues,
  initialStale,
  initialCheckedCount,
  nodePageMap,
  fieldEntityMap,
}: {
  initialRun: RunSummary | null;
  initialIssues: ValidationIssue[];
  initialStale: boolean;
  initialCheckedCount: number;
  nodePageMap: Record<string, string>;
  fieldEntityMap: Record<string, string>;
}) {
  const router = useRouter();
  const [run, setRun] = useState(initialRun);
  const [issues, setIssues] = useState(initialIssues);
  const [stale, setStale] = useState(initialStale);
  const [checkedCount, setCheckedCount] = useState(initialCheckedCount);
  const [running, setRunning] = useState(false);
  const [fixingCode, setFixingCode] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<ValidationSeverity[]>([...SEVERITY_ORDER]);
  const [categoryFilter, setCategoryFilter] = useState<ValidationCategory[]>([...CATEGORY_ORDER]);
  const [search, setSearch] = useState('');

  const infoCount = issues.filter((i) => i.severity === 'info').length;

  async function handleRun() {
    setRunning(true);
    const result = await apiCall<{ run: RunSummary; issues: ValidationIssue[]; checkedCount: number }>('/api/admin/validate', { method: 'POST' });
    setRunning(false);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setRun(result.data.run);
    setIssues(result.data.issues);
    setCheckedCount(result.data.checkedCount);
    setStale(false);
    toast.success(`검증 완료 — 오류 ${result.data.run.errorCount}건, 경고 ${result.data.run.warnCount}건`);
    // AdminHeader의 스텝퍼 ③ 배지는 서버 컴포넌트라 클라이언트 state만 바꿔서는 안 바뀐다 —
    // 서버 컴포넌트를 다시 실행시켜야 방금 만든 ValidationRun을 반영한다(클라이언트 state는 유지됨).
    router.refresh();
  }

  async function handleFix(code: string) {
    setFixingCode(code);
    const result = await apiCall<{ fixedCount: number; run: RunSummary; issues: ValidationIssue[] }>('/api/admin/validate/fix', {
      method: 'POST',
      body: JSON.stringify({ issueCodes: [code] }),
    });
    setFixingCode(null);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setRun(result.data.run);
    setIssues(result.data.issues);
    setStale(false);
    toast.success(`${result.data.fixedCount}건 자동 수정했습니다.`);
    router.refresh();
  }

  const filtered = useMemo(
    () =>
      issues.filter(
        (i) =>
          severityFilter.includes(i.severity) &&
          categoryFilter.includes(i.category) &&
          (search.trim() === '' || i.message.includes(search) || i.code.toLowerCase().includes(search.toLowerCase()))
      ),
    [issues, severityFilter, categoryFilter, search]
  );

  const grouped = useMemo(() => {
    const map = new Map<ValidationCategory, ValidationIssue[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const i of filtered) map.get(i.category)!.push(i);
    return map;
  }, [filtered]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold">구성 검증</h1>
              <p className="text-sm text-muted-foreground">
                {run ? `마지막 실행: ${new Date(run.startedAt).toLocaleString('ko-KR')}` : '아직 검증을 실행하지 않았습니다.'}
              </p>
            </div>
            <Button onClick={handleRun} disabled={running}>
              {running ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              검증 실행
            </Button>
          </div>

          {stale && (
            <Alert>
              <AlertTriangle />
              <AlertTitle>{run ? '설계가 변경되었습니다' : '검증이 필요합니다'}</AlertTitle>
              <AlertDescription>
                {run ? '마지막 검증 이후 드래프트가 바뀌었습니다. 다시 검증하세요.' : '[검증 실행] 버튼을 눌러 현재 설계를 검사하세요.'}
              </AlertDescription>
            </Alert>
          )}

          <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-4', stale && 'opacity-50')}>
            <StatCard icon={<CircleX className="size-4 text-destructive" />} label="오류" value={run?.errorCount ?? 0} />
            <StatCard icon={<AlertTriangle className="size-4 text-amber-500" />} label="경고" value={run?.warnCount ?? 0} />
            <StatCard icon={<Info className="size-4 text-muted-foreground" />} label="정보" value={infoCount} />
            <StatCard icon={<ListChecks className="size-4 text-muted-foreground" />} label="검사한 항목 수" value={checkedCount} />
          </div>

          {run && issues.length > 0 && (
            <div className={cn('flex flex-wrap items-center gap-2', stale && 'opacity-50')}>
              <ToggleGroup type="multiple" size="sm" value={severityFilter} onValueChange={(v: string[]) => setSeverityFilter(v as ValidationSeverity[])}>
                {SEVERITY_ORDER.map((s) => (
                  <ToggleGroupItem key={s} value={s}>
                    {SEVERITY_LABEL[s]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <ToggleGroup type="multiple" size="sm" value={categoryFilter} onValueChange={(v: string[]) => setCategoryFilter(v as ValidationCategory[])}>
                {CATEGORY_ORDER.map((c) => (
                  <ToggleGroupItem key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <div className="relative ml-auto w-56">
                <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="메시지·코드 검색" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 pl-7" />
              </div>
            </div>
          )}

          {run && issues.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CheckCircle2 />
                </EmptyMedia>
                <EmptyTitle>문제가 발견되지 않았습니다</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}

          {run && issues.length > 0 && (
            <Accordion type="multiple" defaultValue={CATEGORY_ORDER} className={cn(stale && 'opacity-50')}>
              {CATEGORY_ORDER.filter((cat) => (grouped.get(cat)?.length ?? 0) > 0).map((cat) => {
                const catIssues = grouped.get(cat)!;
                return (
                  <AccordionItem key={cat} value={cat}>
                    <AccordionTrigger>
                      <span className="flex items-center gap-2">
                        {CATEGORY_LABEL[cat]}
                        <Badge variant="outline">{catIssues.length}</Badge>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="flex flex-col gap-2">
                        {catIssues.map((issue, idx) => {
                          const href = targetHref(issue, nodePageMap, fieldEntityMap);
                          return (
                            <div
                              key={`${issue.code}-${issue.target.type}-${issue.target.id}-${idx}`}
                              className="flex flex-wrap items-center gap-2 rounded-md border p-2.5 text-sm"
                            >
                              <SeverityBadge severity={issue.severity} />
                              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{issue.code}</code>
                              <span className="min-w-0 flex-1">{issue.message}</span>
                              {href && (
                                <Link href={href} className="flex shrink-0 items-center gap-0.5 text-xs text-primary hover:underline">
                                  대상 보기 <ArrowRight className="size-3" />
                                </Link>
                              )}
                              {issue.fixable && (
                                <Button size="sm" variant="outline" disabled={fixingCode === issue.code} onClick={() => handleFix(issue.code)}>
                                  {fixingCode === issue.code ? <Loader2 className="size-3.5 animate-spin" /> : <Wrench className="size-3.5" />}
                                  자동 수정
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </div>
      </div>

      <div className="border-t bg-muted/30 p-4">
        <div className="mx-auto max-w-4xl">
          {!run || stale ? (
            <p className="text-sm text-muted-foreground">검증을 실행하면 배포 가능 여부를 확인할 수 있습니다.</p>
          ) : run.errorCount === 0 ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Alert className="flex-1">
                <CheckCircle2 className="text-emerald-600 dark:text-emerald-400" />
                <AlertTitle>검증을 통과했습니다</AlertTitle>
                <AlertDescription>오류 0건입니다. 배포 화면에서 변경 사항을 확인하고 배포하세요.</AlertDescription>
              </Alert>
              <Button asChild>
                <Link href="/admin/deploy">
                  배포 화면으로 <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Alert variant="destructive" className="flex-1">
                <CircleX />
                <AlertTitle>배포할 수 없습니다</AlertTitle>
                <AlertDescription>오류 {run.errorCount}건을 모두 해결해야 배포할 수 있습니다.</AlertDescription>
              </Alert>
              <Button disabled title="오류를 모두 해결해야 배포할 수 있습니다">
                배포 화면으로
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
