import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://drawing-friend.bckim0123.chatgpt.site'),
  title: '그림친구 — 내 그림이 살아나는 모험',
  description: '아이의 그림이 AI 이야기 친구가 되어 함께 모험하고 현재 세션에서 동화책으로 만나는 창작 체험',
  openGraph: {
    title: '그림친구',
    description: '내 그림이 살아나는 모험',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: '그림친구 — 내 그림이 살아나는 모험' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '그림친구',
    description: '내 그림이 살아나는 모험',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
