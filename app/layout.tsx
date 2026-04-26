import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "./components/Sidebar";

export const metadata: Metadata = {
  title: "mint",
  description: "1인 콘텐츠 도구",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <div className="h-screen w-screen p-3 flex gap-3">
          <Sidebar />
          <main className="panel flex-1 min-w-0 flex flex-col overflow-y-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
