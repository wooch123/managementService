import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PERIOD_PRESET,
  isIsoDate,
  monthsBefore,
  periodQueryValues,
  periodSearchString,
  presetRange,
  resolvePeriod,
  toIsoDate,
} from '@/lib/period';

/**
 * 조회 기간 계산.
 *
 * 서버(바인딩을 좁힐 때)와 클라이언트(주소를 바꿀 때)가 같은 함수를 쓰므로, 여기서 어긋나면
 * 화면에 적힌 기간과 실제 조회 범위가 달라진다 — 눈으로는 절대 못 잡는 종류의 오차다.
 */
const TODAY = new Date(2026, 7, 19); // 2026-08-19 (로컬)

describe('기간 프리셋', () => {
  it('기본값은 최근 3개월이다', () => {
    expect(DEFAULT_PERIOD_PRESET).toBe('3m');
    expect(presetRange('3m', TODAY)).toEqual({ from: '2026-05-19', to: '2026-08-19', preset: '3m' });
  });

  it('전체는 양쪽 경계를 걸지 않는다', () => {
    expect(presetRange('all', TODAY)).toEqual({ from: null, to: null, preset: 'all' });
  });

  it('1개월·6개월·1년도 같은 규칙으로 계산한다', () => {
    expect(presetRange('1m', TODAY).from).toBe('2026-07-19');
    expect(presetRange('6m', TODAY).from).toBe('2026-02-19');
    expect(presetRange('12m', TODAY).from).toBe('2025-08-19');
  });

  it('말일에서 뒤로 갈 때 다음 달로 굴러가지 않는다', () => {
    // 3월 31일의 1개월 전은 2월 28일(윤년이면 29일)이어야 한다.
    expect(toIsoDate(monthsBefore(new Date(2026, 2, 31), 1))).toBe('2026-02-28');
    expect(toIsoDate(monthsBefore(new Date(2024, 2, 31), 1))).toBe('2024-02-29');
    expect(toIsoDate(monthsBefore(new Date(2026, 4, 31), 3))).toBe('2026-02-28');
  });
});

describe('주소 → 기간 해석', () => {
  it('preset이 있으면 그 프리셋으로 계산한다', () => {
    expect(resolvePeriod({ preset: '1m' }, '3m', TODAY)).toEqual({ from: '2026-07-19', to: '2026-08-19', preset: '1m' });
  });

  it('from/to를 직접 주면 그대로 쓴다', () => {
    expect(resolvePeriod({ from: '2025-01-01', to: '2025-06-30' }, '3m', TODAY)).toEqual({
      from: '2025-01-01',
      to: '2025-06-30',
      preset: 'custom',
    });
  });

  it('아무것도 없으면 컴포넌트의 기본 프리셋으로 돌아간다', () => {
    expect(resolvePeriod({}, '6m', TODAY).preset).toBe('6m');
    expect(resolvePeriod({}, '3m', TODAY)).toEqual({ from: '2026-05-19', to: '2026-08-19', preset: '3m' });
  });

  it('형식이 틀린 값은 무시하고 기본값으로 간다 (주소를 손으로 고쳐도 깨지지 않는다)', () => {
    for (const raw of [{ preset: '99y' }, { from: '2026-13-45' }, { from: 'yesterday' }, { to: '' }]) {
      expect(resolvePeriod(raw, '3m', TODAY).preset).toBe('3m');
    }
  });

  it('2월 30일 같은 없는 날짜도 걸러낸다', () => {
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(resolvePeriod({ from: '2026-02-30' }, '3m', TODAY).preset).toBe('3m');
  });

  it('시작과 끝이 뒤집혀 있으면 바로잡는다', () => {
    expect(resolvePeriod({ from: '2025-06-30', to: '2025-01-01' }, '3m', TODAY)).toEqual({
      from: '2025-01-01',
      to: '2025-06-30',
      preset: 'custom',
    });
  });

  it('한쪽 경계만 줘도 그쪽만 건다', () => {
    expect(resolvePeriod({ from: '2025-01-01' }, '3m', TODAY)).toEqual({ from: '2025-01-01', to: null, preset: 'custom' });
  });
});

describe('바인딩에 넘기는 값', () => {
  it('경계가 없으면 키 자체를 넣지 않는다 (조건을 아예 걸지 않기 위해)', () => {
    expect(periodQueryValues(presetRange('all', TODAY))).toEqual({});
    expect(periodQueryValues(presetRange('3m', TODAY))).toEqual({ from: '2026-05-19', to: '2026-08-19' });
  });
});

describe('주소 만들기', () => {
  it('기간 외의 파라미터는 건드리지 않는다', () => {
    const base = new URLSearchParams('tab=summary&page=2&from=2020-01-01');
    const next = new URLSearchParams(periodSearchString(base, { preset: '6m' }));
    expect(next.get('tab')).toBe('summary');
    expect(next.get('page')).toBe('2');
    expect(next.get('preset')).toBe('6m');
    expect(next.get('from')).toBeNull();
  });

  it('직접 지정으로 바꾸면 preset이 남지 않는다', () => {
    const base = new URLSearchParams('preset=3m');
    const next = new URLSearchParams(periodSearchString(base, { from: '2025-01-01', to: '2025-03-31' }));
    expect(next.get('preset')).toBeNull();
    expect(next.get('from')).toBe('2025-01-01');
    expect(next.get('to')).toBe('2025-03-31');
  });
});
