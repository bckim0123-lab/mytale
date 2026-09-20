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
  description:
    '나만의 입체 친구를 꾸미고 직접 탐험하는 달빛 숲. 아이의 선택으로 바뀐 숲이 한 권의 동화책으로 남아요.',
  openGraph: {
    title: '그림친구',
    description: '내 그림이 살아나는 모험',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: '그림친구 — 내 그림이 살아나는 모험',
      },
    ],
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
