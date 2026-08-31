import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/shell/ThemeProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { THEME_INIT_SCRIPT } from "@/lib/theme/palettes";

/**
 * 서체는 **저장소에 담아** 쓴다 — 빌드가 바깥 망에 매이지 않게 한다(사용자 결정, 2026-08-31).
 *
 * 예전에는 `next/font/google`로 빌드할 때마다 구글에서 Geist를 받아왔다. 받지 못하면
 * `Failed to fetch \`Geist\` from Google Fonts.`로 **빌드가 죽는다** — 세 번 재시도하고,
 * 개발 모드와 달리 빌드에는 시간 제한도 없다. 사내망처럼 바깥이 막힌 곳에서는 이 저장소의
 * 약속("clone 하면 바로 뜬다") 자체가 성립하지 않았다.
 *
 * 담은 것은 **latin 부분집합의 가변 서체 두 벌**(합쳐 52KB)뿐이다. 이 화면의 글자는 한글과
 * 아스키인데 Geist에는 한글이 없어 어차피 시스템 서체로 떨어진다 — 나머지 부분집합(키릴 등)을
 * 담을 이유가 없다. `weight: '100 900'`은 가변 서체라 한 파일이 그 구간 전체를 낸다는 뜻이다.
 */
const geistSans = localFont({
  src: "./fonts/geist-latin-variable.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/geist-mono-latin-variable.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

/**
 * 여기 제목은 **마지막 안전망**이다. 실제 탭 제목은 각 영역의 레이아웃이 사이트 설정에서 읽은
 * 이름으로 덮어쓴다(운영·관리자 레이아웃의 generateMetadata) — 사이드바 헤더와 같은 값이라
 * 관리자가 이름을 바꾸면 탭 제목도 함께 바뀐다. 이 값은 그 레이아웃 밖의 경로에서만 쓰인다.
 */
export const metadata: Metadata = {
  title: { template: "WebApp_V1 - %s", default: "WebApp_V1" },
  description: "사내 업무용 노코드 웹 애플리케이션 빌더",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // 서체 변수는 <html>에 둔다 — globals.css가 `html { @apply font-sans }`로 적용하는데
    // 변수가 <body>에만 있으면 html 시점에 var()가 비어 선언 전체가 무효가 되고 브라우저
    // 기본 서체로 떨어진다(그동안 Geist가 화면에 반영되지 않던 이유다).
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* 첫 페인트 전에 저장된 테마를 붙여 색이 한 번 튀는 것을 막는다. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
