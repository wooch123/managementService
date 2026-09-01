/**
 * Issue 표의 칸 — 순서도 그대로다(첨부 양식).
 *
 * 컴포넌트(`IssueTable.tsx`)에서 떼어 놓았다: 이 목록은 화면 없이도 뜻이 통하는 자료이고,
 * 이렇게 두어야 시험에서 그대로 읽을 수 있다(컴포넌트를 통째로 불러오면 JSX 때문에 못 읽는다).
 *
 * ── 이름을 줄인 이유 ────────────────────────────────────────────────────────────
 * `불량 Location`→`Location`, `Week Code`→`W/C`, `Sample No`→`Sample`(사용자 지정,
 * 2026-09-01). 폭도 함께 좁혔다 — **머리글이 칸의 최소 너비를 정하므로 이름을 줄이지 않은 채
 * 폭만 줄이면 글자가 밀려 되레 넓어진다.** 목적은 가로 스크롤을 없애는 것이고, 무엇을 가리키는
 * 이름인지는 Issue 표라는 맥락에서 이미 분명하다.
 *
 * ── 뺀 칸 ───────────────────────────────────────────────────────────────────────
 * `slc_max_ec` · `mlc_max_ec` · `tbw` · `stack` · `wafer_map`은 표에서 뺐다. 엔티티의 칸은
 * 남아 있어 이미 들어간 값은 그대로다. EC는 이제 펼친 자리에서 **FAR 원장을 참조해** 보여 준다.
 *
 * 되돌릴 때는 `scripts/site-design.ts`의 조회 `select`와 `issue-row-create`·
 * `issue-row-update` 매핑도 함께 되돌려야 한다. 목록만 고치면 저장할 때 값이 빈 값으로
 * 덮어써진다.
 */
export const ISSUE_COLUMNS = [
  { col: 'no', label: 'No', width: 40 },
  { col: 'fail_location', label: 'Location', width: 84 },
  { col: 'fail_mode', label: '불량 모드', width: 80 },
  { col: 'fail_type', label: '불량 유형', width: 88 },
  { col: 'pjt', label: 'PJT', width: 60 },
  { col: 'week_code', label: 'W/C', width: 52 },
  { col: 'far_no', label: 'FAR No', width: 92 },
  { col: 'sample_no', label: 'Sample', width: 60 },
  { col: 'cust_symptom', label: '고객 불량 현상', width: 100 },
  { col: 'fail_analysis', label: '불량 분석 현황', width: 100 },
  { col: 'progress', label: '진행 상황', width: 80 },
] as const;

/**
 * 펼친 자리의 **고정 그림 칸**(첨부 양식). 이름이 정해져 있어 늘 이 순서로 놓인다 — 줄마다
 * 같은 자리에 같은 것이 있어야 여러 줄을 견주며 볼 수 있다. 그 아래로는 이름 없는 칸을
 * 눌러서 늘리고 줄인다(사용자 지정).
 */
export const FIXED_IMAGE_SLOTS = ['PKG Stack', 'Wafer Map', '추가 정보', '추가 정보'] as const;
export const FIXED_SLOT_COUNT = FIXED_IMAGE_SLOTS.length;
