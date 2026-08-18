import { parseMarkdown, type MdInline } from '@/lib/markdown';
import { cn } from '@/lib/utils';

/**
 * 게시판 본문 렌더러.
 *
 * 파서가 만든 토큰 트리를 React 엘리먼트로만 그린다 — HTML 문자열을 만들지 않으므로
 * 방문자가 쓴 본문에 태그가 섞여 있어도 실행되지 않고 글자로 보인다(src/lib/markdown.ts 참고).
 */
function InlineNodes({ nodes }: { nodes: MdInline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        if (n.kind === 'strong') return <strong key={i}>{n.text}</strong>;
        if (n.kind === 'em') return <em key={i}>{n.text}</em>;
        if (n.kind === 'code')
          return (
            <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
              {n.text}
            </code>
          );
        if (n.kind === 'link')
          return (
            <a
              key={i}
              href={n.href}
              target={n.href.startsWith('/') ? undefined : '_blank'}
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              {n.text}
            </a>
          );
        return <span key={i}>{n.text}</span>;
      })}
    </>
  );
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = parseMarkdown(text);
  return (
    <div className={cn('space-y-3 text-sm leading-relaxed', className)}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'heading': {
            const size = b.level === 1 ? 'text-lg' : b.level === 2 ? 'text-base' : 'text-sm';
            return (
              <p key={i} className={cn('font-semibold', size)}>
                <InlineNodes nodes={b.inline} />
              </p>
            );
          }
          case 'list':
            return b.ordered ? (
              <ol key={i} className="list-decimal space-y-1 pl-5">
                {b.items.map((item, j) => (
                  <li key={j}>
                    <InlineNodes nodes={item} />
                  </li>
                ))}
              </ol>
            ) : (
              <ul key={i} className="list-disc space-y-1 pl-5">
                {b.items.map((item, j) => (
                  <li key={j}>
                    <InlineNodes nodes={item} />
                  </li>
                ))}
              </ul>
            );
          case 'quote':
            return (
              <blockquote
                key={i}
                className="border-l-2 border-muted-foreground/30 pl-3 whitespace-pre-line text-muted-foreground"
              >
                <InlineNodes nodes={b.inline} />
              </blockquote>
            );
          case 'code':
            return (
              <pre
                key={i}
                className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed"
              >
                {b.text}
              </pre>
            );
          case 'hr':
            return <hr key={i} className="border-border" />;
          default:
            return (
              <p key={i} className="whitespace-pre-line">
                <InlineNodes nodes={b.inline} />
              </p>
            );
        }
      })}
    </div>
  );
}
