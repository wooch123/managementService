import { z } from 'zod';
import { Board, BoardPreview } from '@/components/runtime/BoardWidget';
import { defineComponent, type ComponentDef } from '@/lib/registry/types';

/**
 * 게시판 프리셋.
 *
 * 목록 · 조회 · 글쓰기(에디터)를 한 컴포넌트가 모두 갖고 있어서, 캔버스에 올리는 순간 동작한다 —
 * 엔티티를 따로 설계하거나 액션을 연결할 필요가 없다. 글은 플랫폼이 제공하는 BoardPost 테이블에
 * 쌓이고, 어떤 게시판인지는 boardKey로 구분한다(비워 두면 배치된 노드 id가 곧 게시판 id다).
 */
export const boardComponents = [
  defineComponent({
    key: 'board',
    label: '게시판',
    group: '게시판',
    icon: 'clipboard-list',
    description: '목록 · 조회 · 글쓰기가 배치 즉시 동작하는 게시판 (검색 · 분류 · 조회수 포함)',
    isContainer: false,
    bindingModes: [],
    events: [],
    propsSchema: z.object({
      title: z.string().default('게시판'),
      description: z.string().default(''),
      /** 비워 두면 배치된 노드 id를 쓴다. 같은 값을 지정하면 여러 페이지가 한 게시판을 공유한다. */
      boardKey: z.string().default(''),
      pageSize: z.number().int().min(5).max(50).default(10),
      allowWrite: z.boolean().default(true),
      searchable: z.boolean().default(true),
      /** 쉼표로 구분. 비워 두면 분류 열과 선택 상자가 아예 나오지 않는다. */
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
