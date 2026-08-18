import type { ChangeEvent } from 'react';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DatePicker } from '@/components/ui/date-picker';
import { Calendar } from '@/components/ui/calendar';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { Combobox, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem, ComboboxEmpty } from '@/components/ui/combobox';
import { Search } from 'lucide-react';
import { defineComponent, type ComponentDef } from '@/lib/registry/types';

export const inputComponents = [
  defineComponent({
    key: 'input',
    label: '입력창',
    group: '입력',
    icon: 'text-cursor-input',
    description: '한 줄 텍스트 입력',
    isContainer: false,
    bindingModes: ['field'],
    events: [{ name: 'onChange', label: '값 변경 시', payload: 'value' }],
    propsSchema: z.object({
      label: z.string().default('라벨'),
      placeholder: z.string().default(''),
      type: z.enum(['text', 'email', 'number', 'password', 'tel', 'url']).default('text'),
    }),
    defaultProps: { label: '라벨', placeholder: '', type: 'text' },
    defaultGrid: { span: 4, rowSpan: 8 },
    render: ({ node, props, value, onValueChange }) => (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={node.id}>{props.label}</Label>
        <Input
          id={node.id}
          type={props.type}
          placeholder={props.placeholder}
          {...(onValueChange
            ? { value: (value as string) ?? '', onChange: (e: ChangeEvent<HTMLInputElement>) => onValueChange(e.target.value) }
            : {})}
        />
      </div>
    ),
  }),
  defineComponent({
    key: 'textarea',
    label: '여러 줄 입력',
    group: '입력',
    icon: 'text',
    description: '여러 줄 텍스트 입력',
    isContainer: false,
    bindingModes: ['field'],
    events: [{ name: 'onChange', label: '값 변경 시', payload: 'value' }],
    propsSchema: z.object({
      label: z.string().default('라벨'),
      placeholder: z.string().default(''),
      rows: z.number().min(2).max(20).default(4),
    }),
    defaultProps: { label: '라벨', placeholder: '', rows: 4 },
    defaultGrid: { span: 6, rowSpan: 16 },
    render: ({ node, props }) => (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={node.id}>{props.label}</Label>
        <Textarea id={node.id} placeholder={props.placeholder} rows={props.rows} />
      </div>
    ),
  }),
  defineComponent({
    key: 'native-select',
    label: '기본 선택 상자',
    group: '입력',
    icon: 'chevron-down',
    description: 'HTML 기본 select',
    isContainer: false,
    bindingModes: ['field'],
    events: [{ name: 'onChange', label: '값 변경 시', payload: 'value' }],
    propsSchema: z.object({ label: z.string().default('라벨') }),
    defaultProps: { label: '라벨' },
    defaultGrid: { span: 4, rowSpan: 8 },
    render: ({ node, props }) => (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={node.id}>{props.label}</Label>
        <NativeSelect id={node.id}>
          <NativeSelectOption value="1">옵션 1</NativeSelectOption>
          <NativeSelectOption value="2">옵션 2</NativeSelectOption>
        </NativeSelect>
      </div>
    ),
  }),
  defineComponent({
    key: 'select',
    label: '선택 상자',
    group: '입력',
    icon: 'list-filter',
    description: '커스텀 드롭다운 선택',
    isContainer: false,
    bindingModes: ['field'],
    events: [{ name: 'onChange', label: '값 변경 시', payload: 'value' }],
    propsSchema: z.object({ label: z.string().default('라벨'), placeholder: z.string().default('선택하세요') }),
    defaultProps: { label: '라벨', placeholder: '선택하세요' },
    defaultGrid: { span: 4, rowSpan: 8 },
    render: ({ props }) => (
      <div className="flex flex-col gap-1.5">
        <Label>{props.label}</Label>
        <Select>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={props.placeholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">옵션 1</SelectItem>
            <SelectItem value="2">옵션 2</SelectItem>
          </SelectContent>
        </Select>
      </div>
    ),
  }),
  defineComponent({
    key: 'combobox',
    label: '검색 선택 상자',
    group: '입력',
    icon: 'search',
    description: '검색하며 선택하는 콤보박스',
    isContainer: false,
    bindingModes: ['field'],
    events: [{ name: 'onChange', label: '값 변경 시', payload: 'value' }],
    propsSchema: z.object({ label: z.string().default('라벨') }),
    defaultProps: { label: '라벨' },
    defaultGrid: { span: 4, rowSpan: 8 },
    render: ({ props }) => (
      <div className="flex flex-col gap-1.5">
        <Label>{props.label}</Label>
        <Combobox>
          <ComboboxInput placeholder="검색..." />
          <ComboboxContent>
            <ComboboxEmpty>결과 없음</ComboboxEmpty>
            <ComboboxList>
              <ComboboxItem value="1">옵션 1</ComboboxItem>
              <ComboboxItem value="2">옵션 2</ComboboxItem>
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>
    ),
  }),
  defineComponent({
    key: 'checkbox',
    label: '체크박스',
    group: '입력',
    icon: 'square-check',
    description: '단일 체크박스',
    isContainer: false,
    bindingModes: ['field'],
    events: [{ name: 'onChange', label: '값 변경 시', payload: 'checked' }],
    propsSchema: z.object({ label: z.string().default('동의합니다') }),
    defaultProps: { label: '동의합니다' },
    defaultGrid: { span: 4, rowSpan: 6 },
    render: ({ node, props }) => (
      <div className="flex items-center gap-2">
        <Checkbox id={node.id} />
        <Label htmlFor={node.id}>{props.label}</Label>
      </div>
    ),
  }),
  defineComponent({
    key: 'radio-group',
    label: '라디오 그룹',
    group: '입력',
    icon: 'circle-dot',
    description: '단일 선택 라디오 버튼 그룹',
    isContainer: false,
    bindingModes: ['field'],
    events: [{ name: 'onChange', label: '값 변경 시', payload: 'value' }],
    propsSchema: z.object({
      label: z.string().default('옵션 선택'),
      options: z.array(z.object({ value: z.string(), label: z.string() })).default([
        { value: '1', label: '옵션 1' },
        { value: '2', label: '옵션 2' },
      ]),
    }),
    defaultProps: {
      label: '옵션 선택',
      options: [
        { value: '1', label: '옵션 1' },
        { value: '2', label: '옵션 2' },
      ],
    },
    defaultGrid: { span: 4, rowSpan: 12 },
    render: ({ props }) => (
      <div className="flex flex-col gap-1.5">
        <Label>{props.label}</Label>
        <RadioGroup defaultValue={props.options[0]?.value}>
          {props.options.map((opt) => (
            <div key={opt.value} className="flex items-center gap-2">
              <RadioGroupItem value={opt.value} id={`${opt.value}`} />
              <Label htmlFor={`${opt.value}`}>{opt.label}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>
    ),
  }),
  defineComponent({
    key: 'switch',
    label: '스위치',
    group: '입력',
    icon: 'toggle-left',
    description: 'On/Off 토글 스위치',
    isContainer: false,
    bindingModes: ['field'],
    events: [{ name: 'onChange', label: '값 변경 시', payload: 'checked' }],
    propsSchema: z.object({ label: z.string().default('알림 받기') }),
    defaultProps: { label: '알림 받기' },
    defaultGrid: { span: 4, rowSpan: 6 },
    render: ({ node, props }) => (
      <div className="flex items-center gap-2">
        <Switch id={node.id} />
        <Label htmlFor={node.id}>{props.label}</Label>
      </div>
    ),
  }),
  defineComponent({
    key: 'slider',
    label: '슬라이더',
    group: '입력',
    icon: 'sliders-horizontal',
    description: '범위 값을 조절하는 슬라이더',
    isContainer: false,
    bindingModes: ['field'],
    events: [{ name: 'onChange', label: '값 변경 시', payload: 'value' }],
    propsSchema: z.object({
      label: z.string().default('값'),
      min: z.number().default(0),
      max: z.number().default(100),
    }),
    defaultProps: { label: '값', min: 0, max: 100 },
    defaultGrid: { span: 4, rowSpan: 8 },
    render: ({ props }) => (
      <div className="flex flex-col gap-1.5">
        <Label>{props.label}</Label>
        <Slider min={props.min} max={props.max} defaultValue={[props.min]} />
      </div>
    ),
  }),
  defineComponent({
    key: 'toggle',
    label: '토글 버튼',
    group: '입력',
    icon: 'toggle-right',
    description: '눌림 상태를 가지는 버튼',
    isContainer: false,
    bindingModes: ['field'],
    events: [{ name: 'onChange', label: '값 변경 시', payload: 'pressed' }],
    propsSchema: z.object({ label: z.string().default('토글') }),
    defaultProps: { label: '토글' },
    defaultGrid: { span: 2, rowSpan: 6 },
    render: ({ props }) => <Toggle>{props.label}</Toggle>,
  }),
  defineComponent({
    key: 'toggle-group',
    label: '토글 그룹',
    group: '입력',
    icon: 'rows-3',
    description: '여러 옵션 중 선택하는 토글 버튼 그룹',
    isContainer: false,
    bindingModes: ['field'],
    events: [{ name: 'onChange', label: '값 변경 시', payload: 'value' }],
    propsSchema: z.object({
      options: z.array(z.string()).default(['왼쪽', '가운데', '오른쪽']),
    }),
    defaultProps: { options: ['왼쪽', '가운데', '오른쪽'] },
    defaultGrid: { span: 4, rowSpan: 6 },
    render: ({ props }) => (
      <ToggleGroup type="single">
        {props.options.map((opt) => (
          <ToggleGroupItem key={opt} value={opt}>
            {opt}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    ),
  }),
  defineComponent({
    key: 'date-picker',
    label: '날짜 선택',
    group: '입력',
    icon: 'calendar',
    description: '팝업 캘린더로 날짜 선택',
    isContainer: false,
    bindingModes: ['field'],
    events: [{ name: 'onChange', label: '값 변경 시', payload: 'value' }],
    propsSchema: z.object({ label: z.string().default('날짜') }),
    defaultProps: { label: '날짜' },
    defaultGrid: { span: 4, rowSpan: 8 },
    render: ({ props }) => (
      <div className="flex flex-col gap-1.5">
        <Label>{props.label}</Label>
        <DatePicker />
      </div>
    ),
  }),
  defineComponent({
    key: 'calendar',
    label: '달력',
    group: '입력',
    icon: 'calendar-days',
    description: '인라인 달력',
    isContainer: false,
    bindingModes: ['field'],
    events: [{ name: 'onSelect', label: '날짜 선택 시', payload: 'value' }],
    propsSchema: z.object({}),
    defaultProps: {},
    defaultGrid: { span: 4, rowSpan: 30 },
    render: () => <Calendar mode="single" className="rounded-md border" />,
  }),
  defineComponent({
    key: 'input-otp',
    label: '인증번호 입력',
    group: '입력',
    icon: 'key-round',
    description: '자릿수별 인증번호 입력',
    isContainer: false,
    bindingModes: ['field'],
    events: [{ name: 'onComplete', label: '입력 완료 시', payload: 'value' }],
    propsSchema: z.object({ length: z.number().min(4).max(8).default(6) }),
    defaultProps: { length: 6 },
    defaultGrid: { span: 4, rowSpan: 8 },
    render: ({ props }) => (
      <InputOTP maxLength={props.length}>
        <InputOTPGroup>
          {Array.from({ length: props.length }).map((_, i) => (
            <InputOTPSlot key={i} index={i} />
          ))}
        </InputOTPGroup>
      </InputOTP>
    ),
  }),
  defineComponent({
    key: 'input-group',
    label: '입력창 그룹',
    group: '입력',
    icon: 'text-search',
    description: '아이콘/버튼이 붙은 입력창',
    isContainer: false,
    bindingModes: ['field'],
    events: [{ name: 'onChange', label: '값 변경 시', payload: 'value' }],
    propsSchema: z.object({ placeholder: z.string().default('검색') }),
    defaultProps: { placeholder: '검색' },
    defaultGrid: { span: 4, rowSpan: 8 },
    render: ({ props }) => (
      <InputGroup>
        <InputGroupAddon>
          <Search className="size-4" />
        </InputGroupAddon>
        <InputGroupInput placeholder={props.placeholder} />
      </InputGroup>
    ),
  }),
  defineComponent({
    key: 'field',
    label: '필드 래퍼',
    group: '입력',
    icon: 'rows-2',
    description: '라벨+설명이 붙은 필드 래퍼',
    isContainer: true,
    bindingModes: [],
    events: [],
    propsSchema: z.object({ label: z.string().default('필드 라벨'), description: z.string().default('') }),
    defaultProps: { label: '필드 라벨', description: '' },
    defaultGrid: { span: 4, rowSpan: 10 },
    render: ({ props, children }) => (
      <Field>
        <FieldLabel>{props.label}</FieldLabel>
        {children}
        {props.description && <FieldDescription>{props.description}</FieldDescription>}
      </Field>
    ),
  }),
  defineComponent({
    key: 'label',
    label: '라벨',
    group: '입력',
    icon: 'tag',
    description: '단독 텍스트 라벨',
    isContainer: false,
    bindingModes: [],
    events: [],
    propsSchema: z.object({ text: z.string().default('라벨') }),
    defaultProps: { text: '라벨' },
    defaultGrid: { span: 2, rowSpan: 4 },
    render: ({ props }) => <Label>{props.text}</Label>,
  }),
] satisfies ComponentDef[];
