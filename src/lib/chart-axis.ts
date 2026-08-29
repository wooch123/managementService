/**
 * 카테고리 x축 레이블 배치 계산.
 *
 * WHY: recharts는 기본적으로 레이블이 겹치면 중간중간을 통째로 건너뛴다(interval="preserveEnd").
 * 그래서 항목이 많거나 이름이 긴 차트에서는 축에 일부만 찍혀 "무슨 값인지 알 수 없는" 상태가 됐다.
 * 여기서는 `interval: 0`으로 전부 그리게 하되, 가로로 늘어놓으면 겹치는 경우에만 기울인다.
 *
 * 폭은 렌더 시점에 알 수 없으므로(반응형 컨테이너) 글자 수 기반으로 추정한다. 한글·한자·가나는
 * 폰트 크기와 거의 같은 폭을, 라틴 문자는 그 절반 정도를 차지한다는 경험값을 쓴다.
 */

const WIDE_CHAR = /[ᄀ-ᇿ぀-ヿ㄰-㆏一-鿿가-힯＀-｠]/;

/** 문자열이 차지하는 대략적인 픽셀 폭. */
export function estimateTextWidth(text: string, fontSize = 11): number {
  let units = 0;
  for (const ch of text) {
    if (WIDE_CHAR.test(ch)) units += 1;
    else if (ch === ' ') units += 0.32;
    else if (/[.,:;'`|!Iil]/.test(ch)) units += 0.3;
    else units += 0.55;
  }
  return units * fontSize;
}

export type XAxisLayout = {
  /** 0 = 모든 레이블을 그린다(건너뛰기 없음). */
  interval: 0;
  /** 음수 = 반시계 방향으로 기울임. 0이면 가로쓰기. */
  angle: number;
  textAnchor: 'middle' | 'end';
  /** 축이 차지할 높이(px). 기울인 글자가 잘리지 않도록 계산한다. */
  height: number;
  tickMargin: number;
  /** 글자 수 제한(넘으면 말줄임). null이면 자르지 않는다. */
  maxChars: number | null;
  /**
   * 양 끝 레이블이 그림 영역 밖으로 삐져나가지 않도록 좌우에 비워 둘 폭.
   *
   * WHY: 가로쓰기 레이블은 눈금 위에 **가운데 정렬**되므로 첫/마지막 레이블은 절반이 축 밖으로
   * 나가 잘린다. 항목이 적고 이름이 길 때 특히 눈에 띈다 — 4개월짜리 추이에서 '2026-05'가
   * '26-05'로 잘려 보였다. 기울인 경우에는 오른쪽 끝에 맞춰 그리므로 이 문제가 없다.
   */
  padding: { left: number; right: number };
};

const DEFAULTS = {
  fontSize: 11,
  /** 대시보드 카드 한 칸에 들어가는 차트의 대략적인 그림 영역 폭. */
  plotWidth: 520,
  /** 축이 차트 높이를 잡아먹지 않도록 제한. */
  maxHeight: 88,
  /** 좌우 여백 상한 — 이 이상 비우면 그림이 눈에 띄게 좁아진다. */
  maxEdgePad: 40,
};

const NO_PADDING = { left: 0, right: 0 } as const;

/**
 * 레이블 목록을 보고 회전 여부·각도·축 높이를 정한다.
 *
 * - 가로로 다 들어가면 그대로 둔다(angle 0).
 * - 넘치면 -35°로 기울이고, 그래도 빽빽하면(칸당 폭이 글자 높이보다 좁으면) -60°까지 세운다.
 * - 기울여도 너무 긴 이름은 말줄임 처리해 축 높이가 무한정 커지는 것을 막는다(전체 값은 툴팁에 나온다).
 */
export function categoricalXAxisLayout(
  labels: readonly (string | number)[],
  opts: { fontSize?: number; plotWidth?: number; maxHeight?: number } = {}
): XAxisLayout {
  const fontSize = opts.fontSize ?? DEFAULTS.fontSize;
  const plotWidth = opts.plotWidth ?? DEFAULTS.plotWidth;
  const maxHeight = opts.maxHeight ?? DEFAULTS.maxHeight;

  const texts = labels.map((l) => String(l ?? ''));
  const count = texts.length;
  if (count === 0) {
    return { interval: 0, angle: 0, textAnchor: 'middle', height: 24, tickMargin: 6, maxChars: null, padding: NO_PADDING };
  }

  const widest = Math.max(...texts.map((t) => estimateTextWidth(t, fontSize)));
  const slot = plotWidth / count; // 레이블 하나가 쓸 수 있는 가로 폭
  const GAP = 6;

  // 가로로 두어도 겹치지 않는다면 회전하지 않는다.
  if (widest + GAP <= slot) {
    // 양 끝 레이블의 절반이 축 밖으로 나가지 않도록 그만큼 비워 둔다.
    const pad = Math.min(DEFAULTS.maxEdgePad, Math.ceil(widest / 2));
    return { interval: 0, angle: 0, textAnchor: 'middle', height: 24, tickMargin: 6, maxChars: null, padding: { left: pad, right: pad } };
  }

  // 기울였을 때 이웃과 부딪히지 않으려면 칸 폭이 (글자 높이 / sin θ)보다 넓어야 한다.
  // 35°로 부족하면 60°까지 세운다.
  const needSteep = slot < fontSize / Math.sin((35 * Math.PI) / 180);
  const angle = needSteep ? -60 : -35;

  // 기울인 글자가 차지하는 세로 길이 = 글자 폭 × sin θ. 최대 높이를 넘으면 글자를 줄인다.
  const rad = (Math.abs(angle) * Math.PI) / 180;
  const tickMargin = 8;
  const needed = widest * Math.sin(rad) + fontSize + tickMargin;

  const longest = texts.reduce((a, b) => (estimateTextWidth(b, fontSize) > estimateTextWidth(a, fontSize) ? b : a));
  let maxChars: number | null = null;
  let height = Math.ceil(needed);
  if (needed > maxHeight) {
    height = maxHeight;
    const allowedWidth = (maxHeight - fontSize - tickMargin) / Math.sin(rad);
    // 가장 긴 레이블을 기준으로 허용 폭에 맞는 글자 수를 역산한다(말줄임표 한 칸 포함).
    let chars = longest.length;
    while (chars > 2 && estimateTextWidth(`${longest.slice(0, chars)}…`, fontSize) > allowedWidth) chars -= 1;
    maxChars = Math.max(2, chars);
  }

  // 기울인 글자는 눈금에서 **왼쪽 위로** 뻗으므로(오른쪽 끝 정렬) 첫 레이블의 앞부분이 잘린다.
  // 실제로 'Data Retention'이 'ention'으로, '2026-W20'이 '0'으로 보였다. 뻗는 만큼 왼쪽을 비운다.
  const rendered = maxChars === null ? longest : `${longest.slice(0, maxChars)}…`;
  const leftPad = Math.min(DEFAULTS.maxEdgePad, Math.ceil(estimateTextWidth(rendered, fontSize) * Math.cos(rad)));

  return {
    interval: 0,
    angle,
    textAnchor: 'end',
    height: Math.max(28, height),
    tickMargin,
    maxChars,
    padding: { left: leftPad, right: 0 },
  };
}

/** 레이블을 글자 수에 맞춰 자르고 말줄임표를 붙인다. */
export function truncateLabel(value: unknown, maxChars: number | null): string {
  const text = String(value ?? '');
  if (maxChars === null || text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…`;
}

/**
 * recharts `<XAxis {...}>`에 그대로 펼쳐 넣는 props.
 * 축 스타일(선 없음·글자 크기)까지 함께 돌려주므로 차트마다 따로 지정할 필요가 없다.
 */
export function categoricalXAxisProps(
  labels: readonly (string | number)[],
  opts: { fontSize?: number; plotWidth?: number; maxHeight?: number } = {}
) {
  const layout = categoricalXAxisLayout(labels, opts);
  return {
    tickLine: false,
    axisLine: false,
    fontSize: opts.fontSize ?? DEFAULTS.fontSize,
    interval: layout.interval,
    angle: layout.angle,
    textAnchor: layout.textAnchor,
    height: layout.height,
    tickMargin: layout.tickMargin,
    padding: layout.padding,
    tickFormatter: (value: unknown) => truncateLabel(value, layout.maxChars),
  } as const;
}

/**
 * y축 이름(세로로 세운 축 제목)을 붙이는 recharts props.
 *
 * 값이 비어 있으면 빈 객체를 돌려주므로, 이름을 넣지 않은 차트는 지금까지와 똑같이 그려진다.
 * 이름을 넣으면 글자가 들어갈 만큼 축 폭을 넓힌다 — 넓히지 않으면 세로 글자가 그림 영역을 침범한다.
 */
export function yAxisLabelProps(label?: string | null) {
  const text = (label ?? '').trim();
  if (!text) return {};
  return {
    width: 56,
    label: {
      value: text,
      angle: -90,
      position: 'insideLeft' as const,
      offset: 6,
      style: { textAnchor: 'middle' as const, fontSize: 11, fill: 'var(--chart-ink)' },
    },
  };
}
