import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/shell/ThemeProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { THEME_CSS, THEME_INIT_SCRIPT } from "@/lib/theme/palettes";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WebApp_V1",
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
        {/* 팔레트 20종의 CSS 변수. globals.css 뒤에 오도록 head에서 직접 넣는다. */}
        <style dangerouslySetInnerHTML={{ __html: THEME_CSS }} />
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
