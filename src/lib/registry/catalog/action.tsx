import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Kbd } from '@/components/ui/kbd';
import { defineComponent, type ComponentDef } from '@/lib/registry/types';

export const actionComponents = [
  defineComponent({
    key: 'button',
    label: '버튼',
    group: '액션',
    icon: 'mouse-pointer-click',
    description: '클릭 가능한 기본 버튼',
    isContainer: false,
    bindingModes: [],
    events: [{ name: 'onClick', label: '클릭 시', payload: null }],
    propsSchema: z.object({
      label: z.string().default('버튼'),
      variant: z.enum(['default', 'outline', 'secondary', 'ghost', 'destructive', 'link']).default('default'),
      size: z.enum(['default', 'sm', 'lg', 'icon']).default('default'),
    }),
    defaultProps: { label: '버튼', variant: 'default', size: 'default' },
    defaultGrid: { span: 2, rowSpan: 6 },
    render: ({ props, dispatch }) => (
      <Button variant={props.variant} size={props.size} onClick={() => dispatch?.('onClick')}>
        {props.label}
      </Button>
    ),
  }),
  defineComponent({
    key: 'button-group',
    label: '버튼 그룹',
    group: '액션',
    icon: 'rows',
    description: '여러 버튼을 붙여서 배치',
    isContainer: false,
    bindingModes: [],
    events: [],
    propsSchema: z.object({ labels: z.array(z.string()).default(['이전', '다음']) }),
    defaultProps: { labels: ['이전', '다음'] },
    defaultGrid: { span: 3, rowSpan: 6 },
    render: ({ props }) => (
      <ButtonGroup>
        {props.labels.map((l) => (
          <Button key={l} variant="outline">
            {l}
          </Button>
        ))}
      </ButtonGroup>
    ),
  }),
  defineComponent({
    key: 'kbd',
    label: '키보드 키',
    group: '액션',
    icon: 'keyboard',
    description: '단축키 표시',
    isContainer: false,
    bindingModes: [],
    events: [],
    propsSchema: z.object({ text: z.string().default('Ctrl') }),
    defaultProps: { text: 'Ctrl' },
    defaultGrid: { span: 1, rowSpan: 4 },
    render: ({ props }) => <Kbd>{props.text}</Kbd>,
  }),
] satisfies ComponentDef[];
