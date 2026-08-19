import { z } from 'zod';
import { Board, BoardPreview } from '@/components/runtime/BoardWidget';
import { defineComponent, type ComponentDef } from '@/lib/registry/types';

/**
 * 게시판 프리셋 — **대화(채팅) 화면**.
 *
 * 캔버스에 올리는 순간 동작한다 — 엔티티를 따로 설계하거나 액션을 연결할 필요가 없다. 메시지는
 * 플랫폼이 제공하는 BoardPost/BoardAttachment 표에 쌓이고, 어떤 게시판인지는 boardKey로
 * 구분한다(비워 두면 배치된 노드 id가 곧 게시판 id다).
 *
 * 원래는 목록 → 글 열기 → 글쓰기로 넘어가는 게시판이었다. 실제 쓰임이 "짧은 이야기를 계속
 * 주고받는" 쪽이라 대화 화면으로 바꿨고, 예전 글은 그대로 말풍선으로 보인다(제목이 있던 글은
 * 첫 줄에 굵게).
 */
export const boardComponents = [
  defineComponent({
    key: 'board',
    label: '게시판',
    group: '게시판',
    icon: 'messages-square',
    description: '배치 즉시 동작하는 대화형 게시판 — 이미지 붙여넣기 · 갤러리 · 검색 포함',
    isContainer: false,
    bindingModes: [],
    events: [],
    propsSchema: z.object({
      title: z.string().default('게시판'),
      description: z.string().default(''),
      /** 비워 두면 배치된 노드 id를 쓴다. 같은 값을 지정하면 여러 페이지가 한 게시판을 공유한다. */
      boardKey: z.string().default(''),
      /** 한 번에 불러오는 메시지 수의 기준값(위로 올려 더 읽을 때도 같은 크기로 이어 붙인다). */
      pageSize: z.number().int().min(5).max(50).default(10),
      allowWrite: z.boolean().default(true),
      searchable: z.boolean().default(true),
      /** 쉼표로 구분. 비워 두면 분류 선택 상자가 아예 나오지 않는다. */
      categories: z.string().default(''),
    }),
    defaultProps: {
      title: '게시판',
      description: '',
      boardKey: '',
      pageSize: 10,
      allowWrite: true,
      searchable: true,
      categories: '',
    },
    defaultGrid: { span: 12, rowSpan: 44 },
    // 운영/미리보기(런타임 훅이 붙는 경우)에서만 실제 API를 부른다. 빌더 캔버스·팔레트는 정적
    // 미리보기를 그려서, 편집 중에 목록 조회가 무더기로 나가는 일을 막는다(실시간 채팅과 동일).
    render: ({ node, props, onValueChange }) =>
      typeof onValueChange === 'function' ? (
        <Board
          boardKey={props.boardKey.trim() || node.id}
          title={props.title}
          description={props.description}
          pageSize={props.pageSize}
          allowWrite={props.allowWrite}
          searchable={props.searchable}
          categories={props.categories}
        />
      ) : (
        <BoardPreview title={props.title} />
      ),
  }),
] satisfies ComponentDef[];
