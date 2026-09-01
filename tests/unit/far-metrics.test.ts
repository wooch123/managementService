import { describe, it, expect } from 'vitest';
import { ISSUE_COLUMNS } from '@/lib/issue/columns';

/**
 * Issue 표의 칸 목록.
 *
 * 이름을 줄인 것과(가로 스크롤을 없애려고) 뺀 칸이 되살아나지 않는 것을 못 박아 둔다 —
 * 칸을 되돌리려면 저장 액션의 매핑도 함께 되돌려야 하는데, 목록만 고치면 저장할 때 값이
 * 빈 값으로 덮어써진다.
 */
describe('ISSUE_COLUMNS', () => {
  // `as const`라 키가 리터럴 유니온이 된다. 여기서는 "없는 칸"도 물어봐야 하므로 string으로 넓힌다.
  const byCol = new Map<string, { col: string; label: string; width: number }>(
    ISSUE_COLUMNS.map((c) => [c.col, c])
  );

  it('이름을 줄인 칸은 줄인 이름을 쓴다', () => {
    expect(byCol.get('fail_location')?.label).toBe('Location');
    expect(byCol.get('week_code')?.label).toBe('W/C');
    expect(byCol.get('sample_no')?.label).toBe('Sample');
  });

  it('뺀 다섯 칸은 목록에 없다', () => {
    for (const col of ['slc_max_ec', 'mlc_max_ec', 'tbw', 'stack', 'wafer_map']) {
      expect(byCol.has(col), col).toBe(false);
    }
  });

  it('원장에서 값을 찾는 데 쓰는 두 칸은 반드시 있다', () => {
    // 이 둘이 없으면 펼친 칸의 EC·Write size를 찾을 방법이 없다.
    expect(byCol.has('far_no')).toBe(true);
    expect(byCol.has('sample_no')).toBe(true);
  });

  it('칸 이름이 겹치지 않는다', () => {
    expect(new Set(ISSUE_COLUMNS.map((c) => c.col)).size).toBe(ISSUE_COLUMNS.length);
  });

  it('폭을 다 더해도 흔한 화면에 들어간다', () => {
    // 1280px 화면에서 가로 스크롤이 생기지 않게 하는 것이 이 폭들의 목적이다(사용자 지정).
    // 표 좌우의 펼침·저장 열과 여백까지 고려해 넉넉히 950으로 둔다.
    const total = ISSUE_COLUMNS.reduce((sum, c) => sum + c.width, 0);
    expect(total).toBeLessThanOrEqual(950);
  });
});
