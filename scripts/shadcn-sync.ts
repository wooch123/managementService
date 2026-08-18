import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

/**
 * SPEC.md §3.3 필수 목록. 설치 시점 레지스트리에 없던 항목은 대체재로 치환했다:
 *   - toast → sonner (레지스트리에서 toast 제거, sonner로 대체됨)
 *   - data-table, date-picker, typography → 레지스트리에 단일 항목으로 없어
 *     shadcn 공식 문서 패턴을 따라 수동 작성 (src/components/ui/*.tsx)
 */
const REQUIRED_COMPONENTS = [
  // Default components (toast → sonner 대체)
  "accordion", "alert", "alert-dialog", "aspect-ratio", "avatar", "badge",
  "breadcrumb", "button", "button-group", "calendar", "card", "carousel",
  "chart", "checkbox", "collapsible", "combobox", "command", "context-menu",
  "data-table", "date-picker", "dialog", "drawer", "dropdown-menu", "empty",
  "field", "hover-card", "input", "input-group", "input-otp", "item", "kbd",
  "label", "menubar", "native-select", "navigation-menu", "pagination",
  "popover", "progress", "radio-group", "resizable", "scroll-area", "select",
  "separator", "sheet", "sidebar", "skeleton", "slider", "sonner", "spinner",
  "switch", "table", "tabs", "textarea", "toggle", "toggle-group", "tooltip",
  "typography",
  // Utility components (R29)
  "attachment", "bubble", "marker", "message", "message-scroller",
  "questionnaire", "direction",
]

const UI_DIR = path.join(process.cwd(), "src", "components", "ui")

function listInstalled(): Set<string> {
  if (!fs.existsSync(UI_DIR)) return new Set()
  return new Set(
    fs
      .readdirSync(UI_DIR)
      .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
      .map((f) => f.replace(/\.tsx?$/, ""))
  )
}

async function loadCatalogKeys(): Promise<string[] | null> {
  const catalogPath = path.join(
    process.cwd(),
    "src",
    "lib",
    "registry",
    "catalog.ts"
  )
  if (!fs.existsSync(catalogPath)) return null
  try {
    const mod = await import(pathToFileURL(catalogPath).href)
    const catalog = mod.catalog ?? mod.default
    if (!catalog) return null
    return Object.keys(catalog)
  } catch (err) {
    console.error("카탈로그 로드 실패:", err)
    return null
  }
}

async function main() {
  const installed = listInstalled()
  const missing = REQUIRED_COMPONENTS.filter((c) => !installed.has(c))

  console.log(`설치된 components/ui 파일: ${installed.size}개`)
  console.log(`§3.3 필수 목록: ${REQUIRED_COMPONENTS.length}개`)

  if (missing.length > 0) {
    console.log(`\n누락된 컴포넌트 (${missing.length}개):`)
    for (const m of missing) console.log(`  - ${m}`)
  } else {
    console.log("\n누락 0건: §3.3 목록 전체 설치 확인됨.")
  }

  const catalogKeys = await loadCatalogKeys()
  if (catalogKeys === null) {
    console.log(
      "\n카탈로그(src/lib/registry/catalog.ts) 미구현 — P3에서 등록 예정. 카탈로그 대비 검사는 건너뜀."
    )
  } else {
    // 설치 파일명과 카탈로그 키가 다른 경우 (P0에서 결정한 대체재)
    const FILE_TO_CATALOG_KEY: Record<string, string> = { sonner: "toast" }
    const catalogSet = new Set(catalogKeys)
    const uncatalogued = [...installed].filter(
      (c) => !catalogSet.has(FILE_TO_CATALOG_KEY[c] ?? c)
    )
    if (uncatalogued.length > 0) {
      console.warn(
        `\n⚠ 카탈로그에 등록되지 않은 설치 컴포넌트 (${uncatalogued.length}개):`
      )
      for (const u of uncatalogued) console.warn(`  - ${u}`)
    } else {
      console.log("\n모든 설치 컴포넌트가 카탈로그에 등록되어 있음.")
    }
  }

  if (missing.length > 0) {
    process.exitCode = 1
  }
}

main()
