// 자동 생성 파일 — scripts/generate-node-meta.ts로 재생성한다. 직접 수정하지 말 것.
export type NodeMeta = {
  isContainer: boolean;
  allowedChildren: string[] | null;
  defaultGrid: { span: number; rowSpan: number };
  defaultProps: Record<string, unknown>;
  bindingModes: string[];
  events: string[];
};

export const nodeMeta: Record<string, NodeMeta> = {
  "card": {
    "isContainer": true,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 20
    },
    "defaultProps": {
      "title": "카드 제목",
      "description": "",
      "showHeader": true
    },
    "bindingModes": [],
    "events": []
  },
  "separator": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 12,
      "rowSpan": 2
    },
    "defaultProps": {
      "orientation": "horizontal"
    },
    "bindingModes": [],
    "events": []
  },
  "aspect-ratio": {
    "isContainer": true,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 20
    },
    "defaultProps": {
      "ratio": 1.7777777777777777
    },
    "bindingModes": [],
    "events": []
  },
  "resizable": {
    "isContainer": true,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 12,
      "rowSpan": 30
    },
    "defaultProps": {
      "orientation": "horizontal"
    },
    "bindingModes": [],
    "events": []
  },
  "scroll-area": {
    "isContainer": true,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 25
    },
    "defaultProps": {
      "height": 200
    },
    "bindingModes": [],
    "events": []
  },
  "tabs": {
    "isContainer": true,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 12,
      "rowSpan": 25
    },
    "defaultProps": {
      "tab1Label": "탭 1",
      "tab2Label": "탭 2"
    },
    "bindingModes": [],
    "events": []
  },
  "accordion": {
    "isContainer": true,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 15
    },
    "defaultProps": {
      "title": "섹션 제목"
    },
    "bindingModes": [],
    "events": []
  },
  "collapsible": {
    "isContainer": true,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 15
    },
    "defaultProps": {
      "title": "자세히 보기"
    },
    "bindingModes": [],
    "events": []
  },
  "item": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 8
    },
    "defaultProps": {
      "title": "제목",
      "description": "설명",
      "icon": "circle"
    },
    "bindingModes": [
      "single"
    ],
    "events": [
      "onClick"
    ]
  },
  "sidebar": {
    "isContainer": true,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 3,
      "rowSpan": 30
    },
    "defaultProps": {
      "title": "메뉴"
    },
    "bindingModes": [],
    "events": []
  },
  "page-title": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 12,
      "rowSpan": 2
    },
    "defaultProps": {
      "title": "페이지 제목",
      "description": ""
    },
    "bindingModes": [],
    "events": []
  },
  "input": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 4,
      "rowSpan": 8
    },
    "defaultProps": {
      "label": "라벨",
      "placeholder": "",
      "type": "text"
    },
    "bindingModes": [
      "field"
    ],
    "events": [
      "onChange"
    ]
  },
  "textarea": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 16
    },
    "defaultProps": {
      "label": "라벨",
      "placeholder": "",
      "rows": 4
    },
    "bindingModes": [
      "field"
    ],
    "events": [
      "onChange"
    ]
  },
  "native-select": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 4,
      "rowSpan": 8
    },
    "defaultProps": {
      "label": "라벨"
    },
    "bindingModes": [
      "field"
    ],
    "events": [
      "onChange"
    ]
  },
  "select": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 4,
      "rowSpan": 8
    },
    "defaultProps": {
      "label": "라벨",
      "placeholder": "선택하세요"
    },
    "bindingModes": [
      "field"
    ],
    "events": [
      "onChange"
    ]
  },
  "combobox": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 4,
      "rowSpan": 8
    },
    "defaultProps": {
      "label": "라벨"
    },
    "bindingModes": [
      "field"
    ],
    "events": [
      "onChange"
    ]
  },
  "checkbox": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 4,
      "rowSpan": 6
    },
    "defaultProps": {
      "label": "동의합니다"
    },
    "bindingModes": [
      "field"
    ],
    "events": [
      "onChange"
    ]
  },
  "radio-group": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 4,
      "rowSpan": 12
    },
    "defaultProps": {
      "label": "옵션 선택",
      "options": [
        {
          "value": "1",
          "label": "옵션 1"
        },
        {
          "value": "2",
          "label": "옵션 2"
        }
      ]
    },
    "bindingModes": [
      "field"
    ],
    "events": [
      "onChange"
    ]
  },
  "switch": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 4,
      "rowSpan": 6
    },
    "defaultProps": {
      "label": "알림 받기"
    },
    "bindingModes": [
      "field"
    ],
    "events": [
      "onChange"
    ]
  },
  "slider": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 4,
      "rowSpan": 8
    },
    "defaultProps": {
      "label": "값",
      "min": 0,
      "max": 100
    },
    "bindingModes": [
      "field"
    ],
    "events": [
      "onChange"
    ]
  },
  "toggle": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 2,
      "rowSpan": 6
    },
    "defaultProps": {
      "label": "토글"
    },
    "bindingModes": [
      "field"
    ],
    "events": [
      "onChange"
    ]
  },
  "toggle-group": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 4,
      "rowSpan": 6
    },
    "defaultProps": {
      "options": [
        "왼쪽",
        "가운데",
        "오른쪽"
      ]
    },
    "bindingModes": [
      "field"
    ],
    "events": [
      "onChange"
    ]
  },
  "date-picker": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 4,
      "rowSpan": 8
    },
    "defaultProps": {
      "label": "날짜"
    },
    "bindingModes": [
      "field"
    ],
    "events": [
      "onChange"
    ]
  },
  "calendar": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 4,
      "rowSpan": 30
    },
    "defaultProps": {},
    "bindingModes": [
      "field"
    ],
    "events": [
      "onSelect"
    ]
  },
  "input-otp": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 4,
      "rowSpan": 8
    },
    "defaultProps": {
      "length": 6
    },
    "bindingModes": [
      "field"
    ],
    "events": [
      "onComplete"
    ]
  },
  "input-group": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 4,
      "rowSpan": 8
    },
    "defaultProps": {
      "placeholder": "검색"
    },
    "bindingModes": [
      "field"
    ],
    "events": [
      "onChange"
    ]
  },
  "field": {
    "isContainer": true,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 4,
      "rowSpan": 10
    },
    "defaultProps": {
      "label": "필드 라벨",
      "description": ""
    },
    "bindingModes": [],
    "events": []
  },
  "label": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 2,
      "rowSpan": 4
    },
    "defaultProps": {
      "text": "라벨"
    },
    "bindingModes": [],
    "events": []
  },
  "table": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 12,
      "rowSpan": 20
    },
    "defaultProps": {
      "columns": [
        "컬럼 1",
        "컬럼 2"
      ]
    },
    "bindingModes": [
      "list"
    ],
    "events": []
  },
  "data-table": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 12,
      "rowSpan": 40
    },
    "defaultProps": {
      "title": "",
      "columns": [],
      "showSearch": true,
      "showExport": false,
      "showCopy": false,
      "selectable": false,
      "density": "default",
      "emptyText": "데이터가 없습니다",
      "selectParam": "",
      "selectFieldId": "",
      "selectSlug": ""
    },
    "bindingModes": [
      "list"
    ],
    "events": [
      "onRowClick",
      "onSelectionChange",
      "onCreateClick"
    ]
  },
  "chart": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 25
    },
    "defaultProps": {
      "title": "",
      "chartType": "bar",
      "color": "primary",
      "unit": "",
      "yLabel": ""
    },
    "bindingModes": [
      "list",
      "aggregate",
      "group"
    ],
    "events": []
  },
  "chart-stacked": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 22
    },
    "defaultProps": {
      "title": "",
      "subtitle": "",
      "unit": "",
      "yLabel": "",
      "maxSeries": 6,
      "showLegend": true
    },
    "bindingModes": [
      "group"
    ],
    "events": []
  },
  "carousel": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 8,
      "rowSpan": 20
    },
    "defaultProps": {
      "slideCount": 3
    },
    "bindingModes": [
      "list"
    ],
    "events": []
  },
  "pagination": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 6
    },
    "defaultProps": {
      "pageCount": 5
    },
    "bindingModes": [],
    "events": [
      "onPageChange"
    ]
  },
  "badge": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 2,
      "rowSpan": 4
    },
    "defaultProps": {
      "text": "상태",
      "variant": "default"
    },
    "bindingModes": [
      "field"
    ],
    "events": []
  },
  "avatar": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 1,
      "rowSpan": 4
    },
    "defaultProps": {
      "initials": "U"
    },
    "bindingModes": [
      "field"
    ],
    "events": []
  },
  "progress": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 4,
      "rowSpan": 4
    },
    "defaultProps": {
      "value": 50
    },
    "bindingModes": [
      "field",
      "aggregate"
    ],
    "events": []
  },
  "typography": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 6
    },
    "defaultProps": {
      "variant": "p",
      "text": "텍스트"
    },
    "bindingModes": [
      "field"
    ],
    "events": []
  },
  "empty": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 15
    },
    "defaultProps": {
      "title": "데이터가 없습니다",
      "description": ""
    },
    "bindingModes": [],
    "events": []
  },
  "skeleton": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 4,
      "rowSpan": 4
    },
    "defaultProps": {
      "height": 20
    },
    "bindingModes": [],
    "events": []
  },
  "gantt-chart": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 12,
      "rowSpan": 26
    },
    "defaultProps": {
      "title": "일정(간트)",
      "showToday": true
    },
    "bindingModes": [
      "list"
    ],
    "events": []
  },
  "kanban-board": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 12,
      "rowSpan": 26
    },
    "defaultProps": {
      "title": "진행 보드(칸반)",
      "maxPerColumn": 8
    },
    "bindingModes": [
      "list"
    ],
    "events": []
  },
  "breadcrumb": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 4
    },
    "defaultProps": {
      "items": [
        "홈",
        "현재 페이지"
      ]
    },
    "bindingModes": [],
    "events": []
  },
  "navigation-menu": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 6
    },
    "defaultProps": {
      "items": [
        "홈",
        "소개",
        "문의"
      ]
    },
    "bindingModes": [],
    "events": []
  },
  "menubar": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 6
    },
    "defaultProps": {
      "menus": [
        "파일",
        "편집"
      ]
    },
    "bindingModes": [],
    "events": []
  },
  "dropdown-menu": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 3,
      "rowSpan": 6
    },
    "defaultProps": {
      "label": "메뉴",
      "items": [
        "항목 1",
        "항목 2"
      ]
    },
    "bindingModes": [],
    "events": [
      "onSelect"
    ]
  },
  "context-menu": {
    "isContainer": true,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 12
    },
    "defaultProps": {
      "items": [
        "복사",
        "삭제"
      ]
    },
    "bindingModes": [],
    "events": [
      "onSelect"
    ]
  },
  "command": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 16
    },
    "defaultProps": {
      "items": [
        "명령 1",
        "명령 2"
      ]
    },
    "bindingModes": [
      "list"
    ],
    "events": [
      "onSelect"
    ]
  },
  "alert": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 8
    },
    "defaultProps": {
      "title": "안내",
      "description": "내용을 입력하세요",
      "variant": "default"
    },
    "bindingModes": [],
    "events": []
  },
  "alert-dialog": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 3,
      "rowSpan": 6
    },
    "defaultProps": {
      "triggerLabel": "삭제",
      "title": "정말 삭제하시겠습니까?",
      "description": "이 작업은 되돌릴 수 없습니다."
    },
    "bindingModes": [],
    "events": [
      "onConfirm",
      "onCancel"
    ]
  },
  "dialog": {
    "isContainer": true,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 20
    },
    "defaultProps": {
      "triggerLabel": "열기",
      "title": "다이얼로그 제목"
    },
    "bindingModes": [],
    "events": [
      "onOpen",
      "onClose"
    ]
  },
  "drawer": {
    "isContainer": true,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 20
    },
    "defaultProps": {
      "title": "드로어 제목"
    },
    "bindingModes": [],
    "events": [
      "onOpen",
      "onClose"
    ]
  },
  "sheet": {
    "isContainer": true,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 4,
      "rowSpan": 25
    },
    "defaultProps": {
      "title": "시트 제목"
    },
    "bindingModes": [],
    "events": [
      "onOpen",
      "onClose"
    ]
  },
  "popover": {
    "isContainer": true,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 4,
      "rowSpan": 15
    },
    "defaultProps": {
      "triggerLabel": "열기"
    },
    "bindingModes": [],
    "events": []
  },
  "hover-card": {
    "isContainer": true,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 4,
      "rowSpan": 12
    },
    "defaultProps": {
      "triggerLabel": "@username"
    },
    "bindingModes": [],
    "events": []
  },
  "tooltip": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 3,
      "rowSpan": 6
    },
    "defaultProps": {
      "triggerLabel": "도움말",
      "text": "설명 텍스트"
    },
    "bindingModes": [],
    "events": []
  },
  "toast": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 4,
      "rowSpan": 6
    },
    "defaultProps": {
      "message": "저장되었습니다",
      "variant": "default"
    },
    "bindingModes": [],
    "events": []
  },
  "spinner": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 1,
      "rowSpan": 4
    },
    "defaultProps": {},
    "bindingModes": [],
    "events": []
  },
  "button": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 2,
      "rowSpan": 6
    },
    "defaultProps": {
      "label": "버튼",
      "variant": "default",
      "size": "default"
    },
    "bindingModes": [],
    "events": [
      "onClick"
    ]
  },
  "button-group": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 3,
      "rowSpan": 6
    },
    "defaultProps": {
      "labels": [
        "이전",
        "다음"
      ]
    },
    "bindingModes": [],
    "events": []
  },
  "kbd": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 1,
      "rowSpan": 4
    },
    "defaultProps": {
      "text": "Ctrl"
    },
    "bindingModes": [],
    "events": []
  },
  "attachment": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 3,
      "rowSpan": 6
    },
    "defaultProps": {
      "title": "문서.pdf",
      "description": "1.2 MB"
    },
    "bindingModes": [
      "field"
    ],
    "events": [
      "onRemove"
    ]
  },
  "bubble": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 4,
      "rowSpan": 6
    },
    "defaultProps": {
      "text": "안녕하세요",
      "align": "start",
      "variant": "default"
    },
    "bindingModes": [
      "field"
    ],
    "events": []
  },
  "marker": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 4,
      "rowSpan": 4
    },
    "defaultProps": {
      "text": "항목"
    },
    "bindingModes": [
      "field"
    ],
    "events": []
  },
  "message": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 8
    },
    "defaultProps": {
      "author": "사용자",
      "text": "메시지 내용",
      "align": "start"
    },
    "bindingModes": [
      "field"
    ],
    "events": []
  },
  "message-scroller": {
    "isContainer": true,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 30
    },
    "defaultProps": {},
    "bindingModes": [
      "list"
    ],
    "events": []
  },
  "questionnaire": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 20
    },
    "defaultProps": {
      "question": "질문을 입력하세요",
      "choices": [
        "선택지 1",
        "선택지 2"
      ]
    },
    "bindingModes": [],
    "events": [
      "onSubmit"
    ]
  },
  "direction": {
    "isContainer": true,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 12
    },
    "defaultProps": {
      "direction": "ltr"
    },
    "bindingModes": [],
    "events": []
  },
  "live-chat": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 30
    },
    "defaultProps": {
      "title": "실시간 채팅",
      "room": "default",
      "placeholder": "메시지를 입력하고 Enter"
    },
    "bindingModes": [],
    "events": []
  },
  "date-range-filter": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 12,
      "rowSpan": 3
    },
    "defaultProps": {
      "title": "조회 기간",
      "defaultPreset": "3m",
      "showPresets": true,
      "showCustom": true
    },
    "bindingModes": [],
    "events": []
  },
  "stat-histogram": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 22
    },
    "defaultProps": {
      "title": "히스토그램",
      "binCount": 8,
      "yLabel": ""
    },
    "bindingModes": [
      "list"
    ],
    "events": []
  },
  "stat-boxplot": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 22
    },
    "defaultProps": {
      "title": "박스플롯",
      "yLabel": ""
    },
    "bindingModes": [
      "list"
    ],
    "events": []
  },
  "stat-scatter": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 22
    },
    "defaultProps": {
      "title": "산점도",
      "yLabel": ""
    },
    "bindingModes": [
      "list"
    ],
    "events": []
  },
  "stat-regression": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 22
    },
    "defaultProps": {
      "title": "회귀 분석",
      "yLabel": ""
    },
    "bindingModes": [
      "list"
    ],
    "events": []
  },
  "stat-bubble": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 22
    },
    "defaultProps": {
      "title": "버블 차트",
      "yLabel": ""
    },
    "bindingModes": [
      "list"
    ],
    "events": []
  },
  "stat-pareto": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 22
    },
    "defaultProps": {
      "title": "파레토 분석",
      "subtitle": "",
      "yLabel": ""
    },
    "bindingModes": [
      "list",
      "group"
    ],
    "events": []
  },
  "stat-control-xbar": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 22
    },
    "defaultProps": {
      "title": "X̄ 관리도",
      "sigma": 3
    },
    "bindingModes": [
      "list"
    ],
    "events": []
  },
  "stat-control-r": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 22
    },
    "defaultProps": {
      "title": "R 관리도",
      "sigma": 3
    },
    "bindingModes": [
      "list"
    ],
    "events": []
  },
  "stat-control-imr": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 26
    },
    "defaultProps": {
      "title": "I-MR 관리도",
      "sigma": 3,
      "yLabel": ""
    },
    "bindingModes": [
      "list"
    ],
    "events": []
  },
  "stat-control-p": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 22
    },
    "defaultProps": {
      "title": "p 관리도(불량률)",
      "sigma": 3
    },
    "bindingModes": [
      "list"
    ],
    "events": []
  },
  "stat-capability": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 24
    },
    "defaultProps": {
      "title": "공정능력 분석",
      "binCount": 10,
      "yLabel": ""
    },
    "bindingModes": [
      "list"
    ],
    "events": []
  },
  "stat-run": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 20
    },
    "defaultProps": {
      "title": "런 차트",
      "yLabel": ""
    },
    "bindingModes": [
      "list"
    ],
    "events": []
  },
  "stat-moving-average": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 22
    },
    "defaultProps": {
      "title": "이동평균 추이",
      "window": 5,
      "yLabel": "",
      "baseAs": "line",
      "baseLabel": "실측"
    },
    "bindingModes": [
      "list",
      "group"
    ],
    "events": []
  },
  "stat-cdf": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 20
    },
    "defaultProps": {
      "title": "누적분포(오자이브)",
      "yLabel": ""
    },
    "bindingModes": [
      "list"
    ],
    "events": []
  },
  "stat-qq": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 22
    },
    "defaultProps": {
      "title": "정규확률도(Q-Q)",
      "yLabel": ""
    },
    "bindingModes": [
      "list"
    ],
    "events": []
  },
  "stat-residual": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 20
    },
    "defaultProps": {
      "title": "잔차 도표",
      "yLabel": ""
    },
    "bindingModes": [
      "list"
    ],
    "events": []
  },
  "stat-heatmap": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 20
    },
    "defaultProps": {
      "title": "히트맵",
      "columns": 6
    },
    "bindingModes": [
      "list"
    ],
    "events": []
  },
  "stat-crosstab": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 20
    },
    "defaultProps": {
      "title": "교차 히트맵",
      "subtitle": "",
      "maxColumns": 8,
      "showLegend": true
    },
    "bindingModes": [
      "group"
    ],
    "events": []
  },
  "stat-radar": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 24
    },
    "defaultProps": {
      "title": "레이더 차트"
    },
    "bindingModes": [
      "list"
    ],
    "events": []
  },
  "stat-waterfall": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 22
    },
    "defaultProps": {
      "title": "워터폴 차트",
      "yLabel": ""
    },
    "bindingModes": [
      "list"
    ],
    "events": []
  },
  "stat-funnel": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 22
    },
    "defaultProps": {
      "title": "퍼널 차트"
    },
    "bindingModes": [
      "list"
    ],
    "events": []
  },
  "board": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 12,
      "rowSpan": 44
    },
    "defaultProps": {
      "title": "게시판",
      "description": "",
      "boardKey": "",
      "pageSize": 10,
      "allowWrite": true,
      "searchable": true,
      "categories": ""
    },
    "bindingModes": [],
    "events": []
  },
  "option-select": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 3,
      "rowSpan": 8
    },
    "defaultProps": {
      "label": "라벨",
      "placeholder": "선택하세요",
      "options": []
    },
    "bindingModes": [
      "field"
    ],
    "events": [
      "onChange"
    ]
  },
  "record-detail": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 4,
      "rowSpan": 20
    },
    "defaultProps": {
      "title": "",
      "emptyText": "목록에서 항목을 선택하세요",
      "subtitleCount": 2
    },
    "bindingModes": [
      "list"
    ],
    "events": []
  },
  "record-timeline": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 4,
      "rowSpan": 18
    },
    "defaultProps": {
      "title": "",
      "emptyText": "표시할 이력이 없습니다",
      "maxItems": 8
    },
    "bindingModes": [
      "list"
    ],
    "events": []
  },
  "list-panel": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 4,
      "rowSpan": 20
    },
    "defaultProps": {
      "title": "",
      "subtitle": "",
      "emptyText": "표시할 항목이 없습니다",
      "maxItems": 8,
      "badgeSuffix": "",
      "linkSlug": "",
      "linkParam": "sel",
      "clickable": false
    },
    "bindingModes": [
      "list"
    ],
    "events": []
  },
  "article-cards": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 12,
      "rowSpan": 22
    },
    "defaultProps": {
      "title": "",
      "subtitle": "",
      "emptyText": "표시할 문서가 없습니다",
      "columns": 3,
      "maxItems": 6,
      "linkSlug": "",
      "linkParam": "sel",
      "clickable": false
    },
    "bindingModes": [
      "list"
    ],
    "events": []
  },
  "checklist": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 4,
      "rowSpan": 18
    },
    "defaultProps": {
      "title": "",
      "subtitle": "",
      "items": []
    },
    "bindingModes": [],
    "events": []
  },
  "stepper": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 12,
      "rowSpan": 4
    },
    "defaultProps": {
      "steps": [],
      "current": 1
    },
    "bindingModes": [],
    "events": []
  },
  "nav-cards": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 12,
      "rowSpan": 14
    },
    "defaultProps": {
      "title": "",
      "subtitle": "",
      "columns": 3,
      "items": []
    },
    "bindingModes": [],
    "events": []
  },
  "status-filter": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 12,
      "rowSpan": 3
    },
    "defaultProps": {
      "title": "",
      "param": "status",
      "options": [],
      "showCounts": true
    },
    "bindingModes": [
      "group"
    ],
    "events": []
  },
  "stat-tile": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 3,
      "rowSpan": 7
    },
    "defaultProps": {
      "title": "",
      "unit": "건",
      "secondaryLabel": "",
      "secondaryHigherIsBetter": false,
      "percentMode": "off",
      "target": null,
      "targetLabel": "목표",
      "lowerIsBetter": false,
      "linkSlug": "",
      "linkParam": "",
      "linkValue": ""
    },
    "bindingModes": [
      "aggregate"
    ],
    "events": []
  },
  "stage-bars": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 4,
      "rowSpan": 14
    },
    "defaultProps": {
      "title": "",
      "subtitle": "",
      "order": "",
      "color": "primary",
      "unit": "건"
    },
    "bindingModes": [
      "group"
    ],
    "events": []
  },
  "form-card": {
    "isContainer": true,
    "allowedChildren": [
      "input",
      "textarea",
      "option-select",
      "select",
      "native-select",
      "date-picker",
      "checkbox",
      "switch",
      "radio-group",
      "button",
      "typography",
      "alert"
    ],
    "defaultGrid": {
      "span": 12,
      "rowSpan": 20
    },
    "defaultProps": {
      "title": "",
      "description": "",
      "columns": 2,
      "footnote": ""
    },
    "bindingModes": [],
    "events": []
  },
  "page-header": {
    "isContainer": true,
    "allowedChildren": [
      "button",
      "button-group",
      "badge"
    ],
    "defaultGrid": {
      "span": 12,
      "rowSpan": 3
    },
    "defaultProps": {
      "title": "페이지 제목",
      "description": ""
    },
    "bindingModes": [],
    "events": []
  },
  "search-filter": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 4,
      "rowSpan": 3
    },
    "defaultProps": {
      "label": "통합 검색",
      "placeholder": "검색어를 입력하세요",
      "param": "q"
    },
    "bindingModes": [],
    "events": []
  },
  "select-filter": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 3,
      "rowSpan": 3
    },
    "defaultProps": {
      "label": "필터",
      "param": "filter",
      "allLabel": "전체",
      "options": ""
    },
    "bindingModes": [
      "group"
    ],
    "events": []
  },
  "metric-cards": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 12,
      "rowSpan": 15
    },
    "defaultProps": {
      "title": "",
      "subtitle": "",
      "columns": 3,
      "unit": "건",
      "items": []
    },
    "bindingModes": [
      "group"
    ],
    "events": []
  },
  "callout": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 12,
      "rowSpan": 4
    },
    "defaultProps": {
      "text": "안내 문구",
      "tone": "info"
    },
    "bindingModes": [],
    "events": []
  },
  "issue-list": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 6,
      "rowSpan": 20
    },
    "defaultProps": {
      "title": "",
      "subtitle": "",
      "emptyText": "표시할 항목이 없습니다",
      "maxItems": 10,
      "moreSlug": "",
      "moreLabel": "전체 보기",
      "linkSlug": "",
      "linkParam": "sel",
      "clickable": false
    },
    "bindingModes": [
      "list"
    ],
    "events": []
  },
  "fail-rate-calculator": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 12,
      "rowSpan": 34
    },
    "defaultProps": {
      "title": "불량률 계산기",
      "description": "",
      "defaultSample": 10000,
      "defaultFailures": 3
    },
    "bindingModes": [],
    "events": []
  },
  "visit-stats": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 12,
      "rowSpan": 40
    },
    "defaultProps": {
      "title": "접속 현황",
      "description": "",
      "days": 30
    },
    "bindingModes": [],
    "events": []
  },
  "reball-cost": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 12,
      "rowSpan": 34
    },
    "defaultProps": {
      "title": "작업 내용 · 비용",
      "description": "",
      "defaultOver200ball": true,
      "collapsible": false
    },
    "bindingModes": [
      "list"
    ],
    "events": []
  },
  "reball-request-table": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 12,
      "rowSpan": 40
    },
    "defaultProps": {
      "title": "Reball 의뢰서",
      "description": ""
    },
    "bindingModes": [
      "list"
    ],
    "events": [
      "onSubmit"
    ]
  },
  "pkg-stack": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 12,
      "rowSpan": 40
    },
    "defaultProps": {
      "title": "PKG Stack",
      "description": ""
    },
    "bindingModes": [
      "list"
    ],
    "events": [
      "onSubmit"
    ]
  },
  "tech-report": {
    "isContainer": false,
    "allowedChildren": null,
    "defaultGrid": {
      "span": 12,
      "rowSpan": 90
    },
    "defaultProps": {
      "title": "",
      "description": ""
    },
    "bindingModes": [],
    "events": []
  }
};
