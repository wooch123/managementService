export const ICON_CATEGORIES = [
  '전체',
  '화살표',
  '파일',
  '커뮤니케이션',
  '미디어',
  '상거래',
  '지도',
  '개발',
  '기타',
] as const;

export type IconCategory = (typeof ICON_CATEGORIES)[number];

/**
 * lucide-react는 아이콘별 카테고리 메타데이터를 배포판에 포함하지 않는다.
 * 새 의존성을 추가하는 대신, 아이콘 이름(kebab-case) 키워드로 분류하는
 * 휴리스틱을 사용한다. 매칭되지 않으면 '기타'로 분류된다.
 */
const KEYWORD_RULES: [Exclude<IconCategory, '전체'>, string[]][] = [
  ['화살표', ['arrow', 'chevron', 'corner-', 'expand', 'shrink', 'maximize', 'minimize', 'redo', 'undo', 'rotate', 'move']],
  ['파일', ['file', 'folder', 'archive', 'paperclip', 'clipboard', 'save', 'download', 'upload', 'floppy', 'book', 'notebook', 'sheet', 'scroll']],
  ['커뮤니케이션', ['mail', 'message', 'chat', 'phone', 'send', 'bell', 'comment', 'at-sign', 'rss', 'share', 'voicemail', 'contact', 'inbox']],
  ['미디어', ['image', 'video', 'camera', 'music', 'film', 'play', 'pause', 'volume', 'mic', 'headphones', 'radio', 'tv', 'speaker', 'disc', 'gallery', 'aperture']],
  ['상거래', ['cart', 'shopping', 'credit-card', 'wallet', 'dollar', 'coin', 'tag', 'receipt', 'store', 'package', 'gift', 'percent', 'banknote', 'piggy-bank', 'euro', 'pound-sterling', 'yen']],
  ['지도', ['map', 'pin', 'compass', 'globe', 'navigation', 'route', 'flag', 'mountain', 'tent', 'signpost', 'car', 'plane', 'train', 'ship', 'bus', 'bike', 'anchor']],
  ['개발', ['code', 'terminal', 'git', 'bug', 'database', 'server', 'cpu', 'braces', 'brackets', 'function', 'webhook', 'binary', 'regex', 'github', 'gitlab', 'docker', 'container', 'chip']],
];

export function categorizeIcon(name: string): IconCategory {
  for (const [category, keywords] of KEYWORD_RULES) {
    if (keywords.some((kw) => name.includes(kw))) return category;
  }
  return '기타';
}
