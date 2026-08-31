import { z } from 'zod';
import { FailRateCalculator, FailRateCalculatorPreview } from '@/components/runtime/FailRateCalculator';
import { VisitStats, VisitStatsPreview } from '@/components/runtime/VisitStats';
import { ReballCost, ReballCostPreview, toCostRow, type ReballWorkValue } from '@/components/runtime/ReballCost';
import { ReballRequestTable, ReballRequestTablePreview, type ReballRow } from '@/components/runtime/ReballRequestTable';
import { PkgStack, PkgStackPreview, type PkgStackEdit, type PkgStackValue } from '@/components/runtime/PkgStack';
import { DramEvalTable, DramEvalTablePreview } from '@/components/runtime/DramEvalTable';
import { ManualIntake, ManualIntakePreview } from '@/components/runtime/ManualIntake';
import { TechReport, TechReportPreview } from '@/components/runtime/TechReport';
import { defineComponent, type ComponentDef } from '@/lib/registry/types';

/**
 * 업무 화면이 요구하는, 일반 폼으로는 표현되지 않는 컴포넌트들.
 *
 * 세 가지 모두 "배치하면 곧바로 동작한다"는 점에서 게시판·실시간 대화와 같은 성격이다. 다만
 * 이유는 각각 다르다.
 *   · 불량률 계산기 — 저장할 것이 없다. 입력을 받아 그 자리에서 계산할 뿐이라 바인딩이 없다.
 *   · 접속자 통계   — 읽을 곳이 관리자가 설계한 표가 아니라 플랫폼이 남긴 방문 기록(메타 DB)이다.
 *   · Reball 단가   — 시료 하나당 가격은 여러 칸이 **함께** 정해지는 값이라, 값 하나만 아는
 *                     보통의 입력들로는 계산이 성립하지 않는다.
 */
export const operationsComponents = [
  defineComponent({
    key: 'fail-rate-calculator',
    label: '불량률 계산기',
    group: '통계 차트',
    icon: 'calculator',
    description: '불량률·DPPM·신뢰구간과 AFR·FIT·MTBF를 계산한다 — 저장 없이 그 자리에서',
    isContainer: false,
    growsWithContent: true,
    bindingModes: [],
    events: [],
    propsSchema: z.object({
      title: z.string().default('불량률 계산기'),
      description: z.string().default(''),
      defaultSample: z.number().int().min(1).max(100_000_000).default(10000),
      defaultFailures: z.number().int().min(0).max(100_000_000).default(3),
    }),
    defaultProps: { title: '불량률 계산기', description: '', defaultSample: 10000, defaultFailures: 3 },
    defaultGrid: { span: 12, rowSpan: 34 },
    render: ({ props, onValueChange }) =>
      typeof onValueChange === 'function' ? (
        <FailRateCalculator
          title={props.title}
          description={props.description}
          defaultSample={props.defaultSample}
          defaultFailures={props.defaultFailures}
        />
      ) : (
        <FailRateCalculatorPreview title={props.title} />
      ),
  }),

  defineComponent({
    key: 'visit-stats',
    label: '접속자 통계',
    group: '통계 차트',
    icon: 'chart-line',
    description: '일간 접속자 추이와 화면별 이용률 — 운영 화면 방문 기록을 집계한다',
    isContainer: false,
    growsWithContent: true,
    bindingModes: [],
    events: [],
    propsSchema: z.object({
      title: z.string().default('접속 현황'),
      description: z.string().default(''),
      days: z.number().int().min(7).max(180).default(30),
    }),
    defaultProps: { title: '접속 현황', description: '', days: 30 },
    defaultGrid: { span: 12, rowSpan: 40 },
    render: ({ props, onValueChange }) =>
      typeof onValueChange === 'function' ? (
        <VisitStats title={props.title} description={props.description} days={props.days} />
      ) : (
        <VisitStatsPreview title={props.title} />
      ),
  }),

  defineComponent({
    key: 'reball-cost',
    label: 'Reball 작업·단가',
    group: '입력',
    icon: 'coins',
    description: '작업 항목을 고르면 단가표를 참조해 시료당 가격과 총액을 계산한다 — 단가 수정 포함',
    isContainer: false,
    growsWithContent: true,
    /** 단가표(행 하나짜리 설정 표)를 list로 읽는다. */
    bindingModes: ['list'],
    events: [],
    propsSchema: z.object({
      title: z.string().default('작업 내용 · 비용'),
      description: z.string().default(''),
      /** 200ball 이상을 처음부터 켜 둘지 — 흔한 패키지 쪽에 맞춰 두면 대부분 그대로 쓴다. */
      defaultOver200ball: z.boolean().default(true),
      /** 제목을 눌러 접었다 펼 수 있게 한다. 켜면 접힌 채로 시작한다 — 가끔 보는 표에 알맞다. */
      collapsible: z.boolean().default(false),
    }),
    defaultProps: { title: '작업 내용 · 비용', description: '', defaultOver200ball: true, collapsible: false },
    defaultGrid: { span: 12, rowSpan: 34 },
    render: ({ node, props, data, onValueChange }) =>
      typeof onValueChange === 'function' ? (
        <ReballCost
          nodeId={node.id}
          title={props.title}
          description={props.description}
          cost={toCostRow(data)}
          defaultOver200ball={props.defaultOver200ball}
          collapsible={props.collapsible}
          onValueChange={(value: ReballWorkValue) => onValueChange(value)}
        />
      ) : (
        <ReballCostPreview title={props.title} />
      ),
  }),

  /**
   * Reball 의뢰서를 **표 한 장으로** 적는다 — 여러 줄을 한 번에 등록한다(사용자 지정).
   *
   * 단가표를 list 바인딩으로 읽는 것은 'Reball 작업·단가'와 같다. 다른 점은 값을 하나가 아니라
   * 줄마다 내놓고, 등록도 줄마다 한 번씩 실행한다는 것뿐이다(ctx.dispatch에 줄을 넘긴다).
   */
  defineComponent({
    key: 'reball-request-table',
    label: 'Reball 의뢰 표',
    group: '입력',
    icon: 'table-2',
    description: '여러 건을 표로 적어 한 번에 등록한다 — 금액은 단가표에서 자동 계산, 표 복사로 메일에 붙여넣기',
    isContainer: false,
    growsWithContent: true,
    bindingModes: ['list'],
    events: [{ name: 'onSubmit', label: '한 줄 등록', payload: 'Reball 의뢰 한 줄' }],
    propsSchema: z.object({
      title: z.string().default('Reball 의뢰서'),
      description: z.string().default(''),
    }),
    defaultProps: { title: 'Reball 의뢰서', description: '' },
    defaultGrid: { span: 12, rowSpan: 40 },
    render: ({ props, data, dispatch }) =>
      typeof dispatch === 'function' ? (
        <ReballRequestTable
          title={props.title}
          description={props.description}
          cost={toCostRow(data)}
          disabled={false}
          onSubmitRow={(row: ReballRow) => dispatch('onSubmit', row)}
        />
      ) : (
        <ReballRequestTablePreview title={props.title} />
      ),
  }),

  /**
   * PKG Stack 정보 — 적층 구조를 적고, 적어 둔 것들을 갤러리로 편다.
   *
   * 목록은 **바인딩이 준 데이터**를 그린다. 그래서 Part ID 검색은 이 컴포넌트가 아니라 화면의
   * 검색 상자가 주소에 남기고 서버가 걸러 준다 — 카드가 몇 장이 되든 같은 방식으로 작동한다.
   */
  defineComponent({
    key: 'pkg-stack',
    label: 'PKG Stack 정보',
    group: '입력',
    icon: 'layers',
    description: '적층 구조(CH·WAY·Chip 차수)와 그림을 Part ID로 묶어 적고 갤러리로 본다',
    isContainer: false,
    growsWithContent: true,
    bindingModes: ['list'],
    events: [
      { name: 'onSubmit', label: '새로 저장', payload: 'PKG Stack 한 장' },
      { name: 'onUpdate', label: '고쳐 저장', payload: 'PKG Stack 한 장 + 줄 id' },
    ],
    propsSchema: z.object({
      title: z.string().default('PKG Stack'),
      description: z.string().default(''),
    }),
    defaultProps: { title: 'PKG Stack', description: '' },
    defaultGrid: { span: 12, rowSpan: 40 },
    render: ({ props, data, dispatch }) =>
      typeof dispatch === 'function' ? (
        <PkgStack
          title={props.title}
          description={props.description}
          data={data}
          onSubmit={(value: PkgStackValue) => dispatch('onSubmit', value)}
          onUpdate={(value: PkgStackEdit) => dispatch('onUpdate', value)}
        />
      ) : (
        <PkgStackPreview title={props.title} />
      ),
  }),

  defineComponent({
    key: 'dram-eval-table',
    label: 'DRAM LF 평가표',
    group: '입력',
    icon: 'memory-stick',
    description: '양식 그대로의 평가 입력표 — 판정은 Pass/Fail 상자, Signature와 그림은 줄을 펼쳐 적는다',
    isContainer: false,
    growsWithContent: true,
    bindingModes: ['list'],
    events: [
      { name: 'onSubmit', label: '새 줄 저장', payload: '평가 한 줄' },
      { name: 'onUpdate', label: '고쳐 저장', payload: '평가 한 줄 + 줄 id' },
    ],
    propsSchema: z.object({
      title: z.string().default('DRAM LF 평가'),
      description: z.string().default(''),
    }),
    defaultProps: { title: 'DRAM LF 평가', description: '' },
    defaultGrid: { span: 12, rowSpan: 40 },
    render: ({ props, data, dispatch }) =>
      typeof dispatch === 'function' ? (
        <DramEvalTable
          title={props.title}
          description={props.description}
          data={data}
          onSubmit={(row: Record<string, unknown>) => dispatch('onSubmit', row)}
          onUpdate={(row: Record<string, unknown>) => dispatch('onUpdate', row)}
        />
      ) : (
        <DramEvalTablePreview title={props.title} />
      ),
  }),

  /**
   * 접수 직접 추가 — 자동으로 들어오지 못한 FA를 손으로 채운다.
   *
   * FAR No 하나와 sample 총 개수를 받아 1번부터 그 수만큼 **등록 액션을 한 번씩** 실행한다.
   * 어떤 칸이 어느 컬럼으로 가는지는 배포된 스펙이 갖고 있어야 하므로 여기서는 줄만 넘긴다
   * (Reball 의뢰 표와 같은 방식).
   */
  defineComponent({
    key: 'manual-intake',
    label: '접수 직접 추가',
    group: '입력',
    icon: 'file-plus-2',
    description: 'FAR No와 sample 총 개수를 받아 원장에 줄을 만든다 — 자동으로 못 불러온 건을 위한 자리',
    isContainer: false,
    growsWithContent: true,
    bindingModes: [],
    events: [{ name: 'onSubmit', label: 'sample 한 줄 등록', payload: 'FAR No · sample 번호 · 접수일' }],
    propsSchema: z.object({
      title: z.string().default('접수 직접 추가'),
      description: z.string().default(''),
    }),
    defaultProps: { title: '접수 직접 추가', description: '' },
    defaultGrid: { span: 12, rowSpan: 6 },
    render: ({ props, dispatch }) =>
      typeof dispatch === 'function' ? (
        <ManualIntake
          title={props.title}
          description={props.description}
          onSubmitRow={(row) => dispatch('onSubmit', row)}
        />
      ) : (
        <ManualIntakePreview title={props.title} />
      ),
  }),

  defineComponent({
    key: 'tech-report',
    label: 'Tech Report 작성',
    group: '데이터 표시',
    icon: 'file-text',
    description: 'FAR No를 불러오면 원장 값이 채워지는 Tech Report 양식 — sample별 탭 · 그림 업로드 · 자동 저장 · PDF 발행',
    isContainer: false,
    growsWithContent: true,
    /**
     * 바인딩을 물리지 않는다. 이 화면은 표 하나를 읽는 것이 아니라 **FAR 원장·분석 이력·보고서
     * 두 표**를 한 번에 오가며, 저장도 문서 단위로 한다 — 전용 창구(/api/runtime/tech-report)가
     * 그 일을 맡는다(게시판·접속자 통계와 같은 성격).
     */
    bindingModes: [],
    events: [],
    propsSchema: z.object({
      title: z.string().default(''),
      description: z.string().default(''),
    }),
    defaultProps: { title: '', description: '' },
    defaultGrid: { span: 12, rowSpan: 90 },
    render: ({ props, onValueChange }) =>
      typeof onValueChange === 'function' ? (
        <TechReport title={props.title} description={props.description} />
      ) : (
        <TechReportPreview title={props.title} />
      ),
  }),
] satisfies ComponentDef[];
