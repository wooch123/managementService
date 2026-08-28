"use client"

import { Collapsible as CollapsiblePrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      {...props}
    />
  )
}

/**
 * 열리고 닫힐 때 **미끄러진다**(높이 0 ↔ 내용 높이).
 *
 * 아코디언과 같은 방식이다 — Radix가 재어 둔 `--radix-collapsible-content-height`를 쓰는
 * tw-animate-css의 키프레임에 `overflow-hidden`을 얹는다. 처음 열린 채로 마운트될 때는
 * Radix가 애니메이션을 한 번 막아 주므로, 페이지를 열자마자 메뉴가 펼쳐지는 일은 없다.
 *
 * 애니메이션이 걸리는 요소에는 **여백이나 배치 클래스를 두지 않는다**. 그 요소의 높이를
 * 0으로 줄이는 방식이라, 여기에 padding이 있으면 닫힌 뒤에도 그 여백만 남아 빈 줄이 생긴다.
 * 그래서 호출자가 준 className은 안쪽 상자가 받는다(shadcn 아코디언과 같은 구조).
 *
 * 들어올 때는 감속(ease-out), 나갈 때는 가속(ease-in) — 열리는 쪽이 눈에 따라오기 쉽다.
 */
function CollapsibleContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      className="overflow-hidden data-open:animate-collapsible-down data-open:ease-out data-closed:animate-collapsible-up data-closed:ease-in"
      {...props}
    >
      <div className={cn(className)}>{children}</div>
    </CollapsiblePrimitive.CollapsibleContent>
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
