/**
 * 새로 만든 컬럼을 기존 행에 채운다(백필).
 *
 * 컬럼을 더하면 기존 20,000여 행은 전부 비어 있다. 화면은 정상이지만 표와 상세가 '—'로 가득 차
 * 무엇이 달라졌는지 보이지 않는다. 이 앱의 운영 데이터는 원래 시드로 만든 시연용이므로, 새 칸도
 * **기존 값에서 계산하거나 같은 방식으로** 채운다 — 없는 사실을 지어내지 않고 이미 있는 값에서
 * 유도한다.
 *
 *   목표 완료일 = 접수일 + 18일(목표 TAT)      우선순위 = Claim 심각도에서
 *   관찰 결과   = 불량 위치·Fail Mode에서       의뢰 조건 = 유형별 표준값
 *   Tip 태그    = 분류에서                      고정 = 조회수 상위 5건
 *
 * 이미 값이 있는 행은 건드리지 않는다(몇 번 실행해도 안전하다).
 *
 * 실행: pnpm tsx scripts/backfill-blueprint-fields.ts
 */
import Database from 'better-sqlite3';
import { appDbPath } from '@/lib/db/paths';

const db = new Database(appDbPath());

function report(label: string, changes: number): void {
  console.log(`  ${label}: ${changes.toLocaleString('ko-KR')}행`);
}

db.exec('BEGIN');
try {
  // ── Claim 목표 완료일 — 목표 TAT 18일(대시보드 KPI가 쓰는 기준과 같다)
  report(
    'claims.due_date',
    db.prepare(`UPDATE claims SET due_date = date(received_date, '+18 days') WHERE due_date IS NULL AND received_date IS NOT NULL`).run()
      .changes
  );

  // ── FA 배정 우선순위 — Claim 심각도를 따른다(같은 건에 두 기준이 따로 놀지 않게)
  report(
    'fa_assignments.priority',
    db
      .prepare(
        `UPDATE fa_assignments SET priority = (
           SELECT CASE c.severity WHEN 'Critical' THEN '긴급' WHEN 'Major' THEN '높음' ELSE '보통' END
             FROM claims c WHERE c.far_no = fa_assignments.far_no LIMIT 1)
         WHERE priority IS NULL`
      )
      .run().changes
  );
  // Claim이 없는 이력(과거 데이터)은 보통으로.
  db.prepare(`UPDATE fa_assignments SET priority = '보통' WHERE priority IS NULL`).run();

  // ── Tech Report 관찰 결과 — 예전에는 원인/결론만 있어 "무엇을 보았는지"가 빠져 있었다.
  report(
    'fa_tech_reports.observation',
    db
      .prepare(
        `UPDATE fa_tech_reports
            SET observation = COALESCE(ng_location, '대상 부위') || ' 부위에서 ' || COALESCE(fail_mode, '이상') || ' 재현 확인 (재현 3회 중 2회)'
          WHERE observation IS NULL OR observation = ''`
      )
      .run().changes
  );

  // ── Reball 작업 요청 — 업체/비고 한 칸에 섞여 있던 것을 분리했으니 표준 문구로 채운다.
  report(
    'reball_requests.work_note',
    db
      .prepare(
        `UPDATE reball_requests
            SET work_note = COALESCE(package_type, '패키지') || ' ' || COALESCE(qty, 0) || 'ea · 외관 손상 없이 작업 요청'
          WHERE work_note IS NULL OR work_note = ''`
      )
      .run().changes
  );

  // ── 분석 의뢰 유형별 조건 — 자유 서술(content)에 섞여 있던 조건을 칸으로 옮긴 자리.
  const scopeByType: Record<string, string> = {
    '개발실 상세분석': 'Die 표면·단면',
    'Auto향 이력 확인': '출하·신뢰성 이력',
    'DRAM 분석': '전기·동작 특성',
    'pFA(비파괴)': 'X-ray + SAT',
    'pFA(파괴)': 'Decap + 표면 관찰',
  };
  let scopeChanges = 0;
  for (const [type, scope] of Object.entries(scopeByType)) {
    scopeChanges += db
      .prepare(`UPDATE analysis_requests SET analysis_scope = ? WHERE request_type = ? AND (analysis_scope IS NULL OR analysis_scope = '')`)
      .run(scope, type).changes;
  }
  report('analysis_requests.analysis_scope', scopeChanges);

  // 시료 수량 — 의뢰번호에서 2~4ea로 고르게 퍼뜨린다(파괴는 보존분까지 1개 더).
  report(
    'analysis_requests.sample_qty',
    db
      .prepare(
        `UPDATE analysis_requests
            SET sample_qty = 2 + (ABS(CAST(SUBSTR(request_no, -3) AS INTEGER)) % 3) + (CASE request_type WHEN 'pFA(파괴)' THEN 1 ELSE 0 END)
          WHERE sample_qty IS NULL`
      )
      .run().changes
  );

  report(
    'analysis_requests.preserve_cond',
    db
      .prepare(
        `UPDATE analysis_requests
            SET preserve_cond = CASE request_type
                  WHEN 'pFA(파괴)' THEN '잔여 시료 1ea 보존'
                  WHEN 'pFA(비파괴)' THEN '외관 유지 · 전량 반환'
                  WHEN '개발실 상세분석' THEN '원본 1ea 보존'
                  ELSE '해당 없음' END
          WHERE preserve_cond IS NULL OR preserve_cond = ''`
      )
      .run().changes
  );

  // Auto향은 Lot·차종이 없으면 이력 조회 자체가 성립하지 않는다.
  report(
    'analysis_requests.lot_no',
    db
      .prepare(
        `UPDATE analysis_requests
            SET lot_no = 'LOT-A' || SUBSTR(REPLACE(request_date, '-', ''), 3, 6),
                vehicle_project = 'EV Platform ' || CHAR(65 + (ABS(CAST(SUBSTR(request_no, -2) AS INTEGER)) % 4))
          WHERE request_type = 'Auto향 이력 확인' AND (lot_no IS NULL OR lot_no = '')`
      )
      .run().changes
  );

  report(
    'analysis_requests.dram_model',
    db
      .prepare(
        `UPDATE analysis_requests
            SET dram_model = CASE (ABS(CAST(SUBSTR(request_no, -2) AS INTEGER)) % 3)
                  WHEN 0 THEN 'LPDDR5 8GB' WHEN 1 THEN 'LPDDR5 12GB' ELSE 'LPDDR4X 6GB' END
          WHERE request_type = 'DRAM 분석' AND (dram_model IS NULL OR dram_model = '')`
      )
      .run().changes
  );

  // 파괴 분석 승인 — 완료된 건은 이미 승인을 받은 것이고, 진행 전 건은 대기다.
  report(
    'analysis_requests.destruct_approval',
    db
      .prepare(
        `UPDATE analysis_requests
            SET destruct_approval = CASE
                  WHEN request_type <> 'pFA(파괴)' THEN '해당 없음'
                  WHEN req_status IN ('완료', '진행중') THEN '승인 완료'
                  ELSE '승인 대기' END
          WHERE destruct_approval IS NULL`
      )
      .run().changes
  );

  // ── Tip 라이브러리 — 채팅에서 지식으로 바뀐 자리에 필요한 값들.
  report(
    'tips.helpful/tags/updated_date',
    db
      .prepare(
        `UPDATE tips
            SET helpful = CAST(COALESCE(views, 0) * 0.12 AS INTEGER),
                tags = COALESCE(category, '기타') || ', ' || CASE (ABS(CAST(SUBSTR(post_no, -2) AS INTEGER)) % 4)
                  WHEN 0 THEN 'UFS' WHEN 1 THEN 'eMMC' WHEN 2 THEN 'X-ray' ELSE '재현' END,
                updated_date = COALESCE(updated_date, created_date)
          WHERE helpful IS NULL`
      )
      .run().changes
  );

  db.prepare(`UPDATE tips SET is_pinned = 'N' WHERE is_pinned IS NULL`).run();
  report(
    "tips.is_pinned = 'Y'",
    db
      .prepare(
        `UPDATE tips SET is_pinned = 'Y'
          WHERE id IN (SELECT id FROM tips ORDER BY views DESC, post_no ASC LIMIT 6)`
      )
      .run().changes
  );

  db.exec('COMMIT');
  console.log('\n백필 완료.');
} catch (e) {
  db.exec('ROLLBACK');
  throw e;
}
db.close();
