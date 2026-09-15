import type { Metadata } from "next";
import Header from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: "할 일 관리",
  description: "할 일 → 주간 계획 → 1년 목표",
};

// 첫 페인트 전에 저장된 테마 적용(깜빡임 방지). 허용값만 반영
const themeScript = `(function(){try{var t=localStorage.getItem("theme");if(t==="dev"||t==="colorful")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: 인라인 스크립트의 data-theme, 브라우저 확장(예: HWP)이 넣는 속성 차이를 허용. 이 태그 속성에만 적용됨
    <html lang="ko" data-theme="colorful" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <Header />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
