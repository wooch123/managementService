'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
  ExternalLink,
  RotateCcw,
  Code,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { apiCall } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { DeployPreview, DiffItem, ComponentsByPage } from '@/lib/deploy/preview-diff';
import type { SchemaChange } from '@/lib/data-engine/diff';

type Preview = DeployPreview & { destructiveDescriptors: { id: string; description: string }[] };
type Revision = {
  id: string;
  revisionNo: number;
  note: string | null;
  publishedAt: string;
  publishedBy: string;
  specJson: string;
  isActive: boolean;
};

const STEP_LABELS = [
  '드래프트 스펙 로드 · 검증',
  '구성 검증 실행 (오류 0건 확인)',
  'app.db 백업',
  '스키마 변경사항 계산',
  '마이그레이션 적용',
  '리비전 생성',
  '활성 리비전 전환',
  '캐시 무효화',
] as const;

/** publish()가 돌려주는 실패 지점(parse/validate/revision)을 위 8단계 인덱스로 매핑한다 —
 * backup/diff/migrate에서는 실패가 사실상 나지 않게 설계했으므로(§2.3 5단계 주석 참고) 별도
 * 실패 스텝을 두지 않았다. */
const STEP_INDEX_FOR_FAILURE: Record<string, number> = { parse: 0, validate: 1, revision: 5 };

const CONFIRM_PHRASE = '배포합니다';

function DiffBadge({ kind }: { kind: DiffItem['kind'] }) {
  if (kind === 'added') return <Badge className="border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">추가</Badge>;
  if (kind === 'removed') return <Badge variant="destructive">삭제</Badge>;
  return <Badge variant="secondary">수정</Badge>;
}

function DiffRow({ item }: { item: DiffItem }) {
  return (
    <div className="rounded-md border p-2 text-sm">
      <div className="flex items-center gap-2">
        <DiffBadge kind={item.kind} />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
      </div>
      {(item.before !== undefined || item.after !== undefined) && (
        <div className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          {item.before !== undefined && (
            <pre className="overflow-x-auto rounded bg-muted p-2">{JSON.stringify(item.before, null, 2)}</pre>
          )}
          {item.after !== undefined && (
            <pre className="overflow-x-auto rounded bg-muted p-2">{JSON.stringify(item.after, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  );
}

function SchemaChangeRow({ change }: { change: SchemaChange }) {
  const riskLabel = { safe: '안전', blocked: '차단됨', destructive: '파괴적', conditional: '조건부' }[change.risk];
  const riskClass =
    change.risk === 'destructive'
      ? 'border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400'
      : change.risk === 'blocked'
        ? ''
        : 'border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
  return (
    <div className="flex items-center gap-2 rounded-md border p-2 text-sm">
      <Badge variant={change.risk === 'blocked' ? 'destructive' : 'outline'} className={riskClass}>
        {riskLabel}
      </Badge>
      <span className="min-w-0 flex-1 truncate">
        {change.tableName}
        {change.columnName ? `.${change.columnName}` : ''} — {change.kind}
      </span>
      {change.affectedRows != null && <span className="text-xs text-muted-foreground">영향 {change.affectedRows}행</span>}
      {change.reason && <span className="text-xs text-destructive">{change.reason}</span>}
    </div>
  );
}

export function DeployShell({
  canDeploy,
  blockReason,
  preview,
  initialRevisions,
}: {
  canDeploy: boolean;
  blockReason: string | null;
  preview: Preview;
  initialRevisions: Revision[];
}) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [stepIndex, setStepIndex] = useState(-1);
  const [failedStep, setFailedStep] = useState<number | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployedRevisionNo, setDeployedRevisionNo] = useState<number | null>(null);
  const [revisions, setRevisions] = useState(initialRevisions);
  const [specViewer, setSpecViewer] = useState<Revision | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<Revision | null>(null);
  const [rollingBack, setRollingBack] = useState(false);

  const allDestructiveAccepted = preview.destructiveDescriptors.every((d) => acceptedIds.has(d.id));
  const readyToDeploy = canDeploy && preview.hasAnyChange && allDestructiveAccepted;
  const needsPhraseConfirm = preview.destructiveDescriptors.length > 0;

  const componentsTotal = useMemo(
    () => preview.componentsByPage.reduce((sum, p) => sum + p.added + p.modified + p.removed, 0),
    [preview.componentsByPage]
  );

  function toggleAccept(id: string, checked: boolean) {
    setAcceptedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function runDeploy() {
    setConfirmOpen(false);
    setDeploying(true);
    setDeployError(null);
    setFailedStep(null);
    setDeployedRevisionNo(null);
    setStepIndex(0);

    // 진짜 서버 스트리밍 대신, 배포 API 호출과 나란히 단계 애니메이션을 진행한다 — 실패 시
    // publish()가 돌려준 실패 지점까지만 완료 표시하고 그 단계를 실패로 되돌린다.
    const animation = (async () => {
      for (let i = 1; i < STEP_LABELS.length; i++) {
        await new Promise((r) => setTimeout(r, 220));
        setStepIndex((cur) => (cur < i ? i : cur));
      }
    })();

    const result = await apiCall<{ revisionNo: number; revisionId: string }>('/api/admin/deploy', {
      method: 'POST',
      body: JSON.stringify({ note: note || undefined, acceptDestructive: [...acceptedIds] }),
    });

    await animation;

    if (!result.ok) {
      const step = (result.error.details as { step?: string } | undefined)?.step;
      const idx = step ? (STEP_INDEX_FOR_FAILURE[step] ?? 0) : 0;
      setStepIndex(idx);
      setFailedStep(idx);
      setDeployError(result.error.message);
      setDeploying(false);
      toast.error(result.error.message);
      return;
    }

    setStepIndex(STEP_LABELS.length);
    setDeployedRevisionNo(result.data.revisionNo);
    setDeploying(false);
    toast.success(`리비전 ${result.data.revisionNo} 배포 완료`);
    router.refresh();

    const revRes = await apiCall<Revision[]>('/api/admin/revisions');
    if (revRes.ok) setRevisions(revRes.data);
  }

  async function confirmRollback() {
    if (!rollbackTarget) return;
    setRollingBack(true);
    const result = await apiCall<{ revisionNo: number }>(`/api/admin/revisions/${rollbackTarget.id}/activate`, { method: 'POST' });
    setRollingBack(false);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success(`리비전 ${result.data.revisionNo}(으)로 롤백했습니다.`);
    setRevisions((prev) => prev.map((r) => ({ ...r, isActive: r.id === rollbackTarget.id })));
    setRollbackTarget(null);
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
      {!canDeploy && blockReason && (
        <Alert>
          <AlertTitle>아직 배포할 수 없습니다</AlertTitle>
          <AlertDescription>{blockReason}</AlertDescription>
        </Alert>
      )}

      <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* 좌측: 변경 요약(diff) */}
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">변경 요약</h2>
          {!preview.hasAnyChange ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>변경 사항이 없습니다</EmptyTitle>
                <EmptyDescription>직전 배포 이후 드래프트가 바뀌지 않았습니다.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Accordion
              type="multiple"
              defaultValue={['pages', 'components', 'schema', 'actions', 'relations']}
              className="rounded-lg border px-3"
            >
              {preview.pages.length > 0 && (
                <AccordionItem value="pages">
                  <AccordionTrigger>
                    페이지 <Badge variant="outline" className="ml-2">{preview.pages.length}</Badge>
                  </AccordionTrigger>
                  <AccordionContent className="flex flex-col gap-2">
                    {preview.pages.map((item) => (
                      <DiffRow key={item.id} item={item} />
                    ))}
                  </AccordionContent>
                </AccordionItem>
              )}
              {componentsTotal > 0 && (
                <AccordionItem value="components">
                  <AccordionTrigger>
                    컴포넌트 <Badge variant="outline" className="ml-2">{componentsTotal}</Badge>
                  </AccordionTrigger>
                  <AccordionContent className="flex flex-col gap-2">
                    {preview.componentsByPage.map((p: ComponentsByPage) => (
                      <div key={p.pageId} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                        <span className="min-w-0 flex-1 truncate">{p.pageTitle}</span>
                        {p.added > 0 && <Badge className="border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">+{p.added}</Badge>}
                        {p.modified > 0 && <Badge variant="secondary">~{p.modified}</Badge>}
                        {p.removed > 0 && <Badge variant="destructive">-{p.removed}</Badge>}
                      </div>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              )}
              {preview.schemaChanges.length > 0 && (
                <AccordionItem value="schema">
                  <AccordionTrigger>
                    데이터 스키마 <Badge variant="outline" className="ml-2">{preview.schemaChanges.length}</Badge>
                  </AccordionTrigger>
                  <AccordionContent className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2">
                      {preview.schemaChanges
                        .filter((c) => c.risk !== 'destructive')
                        .map((c, i) => (
                          <SchemaChangeRow key={i} change={c} />
                        ))}
                    </div>
                    {preview.destructiveDescriptors.length > 0 && (
                      <div className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
                        <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                          파괴적 변경 — 각 항목을 확인해야 배포할 수 있습니다
                        </p>
                        {preview.destructiveDescriptors.map((d) => (
                          <label key={d.id} className="flex items-center gap-2 text-sm">
                            <Checkbox checked={acceptedIds.has(d.id)} onCheckedChange={(v) => toggleAccept(d.id, v === true)} />
                            {d.description}
                          </label>
                        ))}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              )}
              {preview.actions.length > 0 && (
                <AccordionItem value="actions">
                  <AccordionTrigger>
                    액션 <Badge variant="outline" className="ml-2">{preview.actions.length}</Badge>
                  </AccordionTrigger>
                  <AccordionContent className="flex flex-col gap-2">
                    {preview.actions.map((item) => (
                      <DiffRow key={item.id} item={item} />
                    ))}
                  </AccordionContent>
                </AccordionItem>
              )}
              {preview.relations.length > 0 && (
                <AccordionItem value="relations">
                  <AccordionTrigger>
                    관계 <Badge variant="outline" className="ml-2">{preview.relations.length}</Badge>
                  </AccordionTrigger>
                  <AccordionContent className="flex flex-col gap-2">
                    {preview.relations.map((item) => (
                      <DiffRow key={item.id} item={item} />
                    ))}
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>
          )}
        </div>

        {/* 우측: 배포 실행 */}
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">배포 실행</h2>
          <Card>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="deploy-note">배포 노트 (선택)</Label>
                <Textarea
                  id="deploy-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="이번 배포에서 무엇이 바뀌었는지 기록하세요"
                  rows={3}
                  disabled={deploying}
                />
              </div>
              <Button disabled={!readyToDeploy || deploying} onClick={() => setConfirmOpen(true)}>
                {deploying ? <Loader2 className="size-4 animate-spin" /> : null}
                운영에 배포
              </Button>
              {!allDestructiveAccepted && preview.destructiveDescriptors.length > 0 && (
                <p className="text-xs text-muted-foreground">좌측의 파괴적 변경 항목을 모두 확인해야 배포할 수 있습니다.</p>
              )}

              {stepIndex >= 0 && (
                <div className="flex flex-col gap-1.5 rounded-md border p-3">
                  {STEP_LABELS.map((label, i) => {
                    const isFailed = failedStep === i;
                    const isDone = !isFailed && i < stepIndex;
                    const isCurrent = i === stepIndex && deploying;
                    return (
                      <div key={label} className={cn('flex items-center gap-2 text-xs', isFailed && 'text-destructive')}>
                        {isFailed ? (
                          <XCircle className="size-3.5 shrink-0" />
                        ) : isDone || (i <= stepIndex && !deploying && !failedStep) ? (
                          <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        ) : isCurrent ? (
                          <Loader2 className="size-3.5 shrink-0 animate-spin" />
                        ) : (
                          <Circle className="size-3.5 shrink-0 text-muted-foreground" />
                        )}
                        {label}
                      </div>
                    );
                  })}
                </div>
              )}

              {deployError && (
                <Alert variant="destructive">
                  <AlertTitle>배포 실패</AlertTitle>
                  <AlertDescription>{deployError}</AlertDescription>
                </Alert>
              )}

              {deployedRevisionNo != null && (
                <Alert>
                  <CheckCircle2 className="text-emerald-600 dark:text-emerald-400" />
                  <AlertTitle>리비전 {deployedRevisionNo} 배포 완료</AlertTitle>
                  <AlertDescription>
                    <Button variant="link" asChild className="h-auto p-0">
                      <Link href="/home" target="_blank">
                        운영 사이트 열기 <ExternalLink className="size-3.5" />
                      </Link>
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 하단: 리비전 이력 */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">리비전 이력</h2>
        {revisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 배포 이력이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>번호</TableHead>
                  <TableHead>배포 시각</TableHead>
                  <TableHead>노트</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">동작</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revisions.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.revisionNo}</TableCell>
                    <TableCell>{new Date(r.publishedAt).toLocaleString('ko-KR')}</TableCell>
                    <TableCell className="max-w-64 truncate text-muted-foreground">{r.note || '-'}</TableCell>
                    <TableCell>{r.isActive && <Badge>활성</Badge>}</TableCell>
                    <TableCell className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setSpecViewer(r)}>
                        <Code className="size-3.5" /> 스펙 보기
                      </Button>
                      {!r.isActive && (
                        <Button variant="outline" size="sm" onClick={() => setRollbackTarget(r)}>
                          <RotateCcw className="size-3.5" /> 이 버전으로 롤백
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* 배포 확인 다이얼로그 */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>운영에 배포할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              배포하면 즉시 운영 사이트(/home)에 반영됩니다.
              {needsPhraseConfirm && ' 파괴적 변경이 포함되어 있어, 아래에 문구를 그대로 입력해야 진행할 수 있습니다.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {needsPhraseConfirm && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm-phrase">
                확인을 위해 <span className="font-medium">&quot;{CONFIRM_PHRASE}&quot;</span>를 입력하세요
              </Label>
              <Input id="confirm-phrase" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
            </div>
          )}
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              취소
            </Button>
            <Button disabled={needsPhraseConfirm && confirmText !== CONFIRM_PHRASE} onClick={() => void runDeploy()}>
              배포 <ArrowRight className="size-4" />
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 스펙 보기 */}
      <Dialog open={!!specViewer} onOpenChange={(o) => !o && setSpecViewer(null)}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>리비전 {specViewer?.revisionNo} 스펙</DialogTitle>
          </DialogHeader>
          <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
            {specViewer ? JSON.stringify(JSON.parse(specViewer.specJson), null, 2) : ''}
          </pre>
        </DialogContent>
      </Dialog>

      {/* 롤백 확인 */}
      <AlertDialog open={!!rollbackTarget} onOpenChange={(o) => !o && setRollbackTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>리비전 {rollbackTarget?.revisionNo}(으)로 롤백할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              활성 리비전 포인터만 즉시 교체됩니다. <strong>스키마 변경은 자동으로 되돌리지 않습니다</strong> — 이후 배포에서
              추가/변경된 테이블·컬럼은 그대로 남습니다. 데이터까지 되돌리려면 <code>data/backups/</code>의 백업 파일로 직접
              복원해야 합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setRollbackTarget(null)}>
              취소
            </Button>
            <Button disabled={rollingBack} onClick={() => void confirmRollback()}>
              {rollingBack ? <Loader2 className="size-4 animate-spin" /> : null}
              롤백
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
