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
  metadataBase: new URL('https://drawing-friend-site.vercel.app'),
  icons: { icon: { url: '/favicon.svg', type: 'image/svg+xml' } },
  title: '그림친구 — 내 그림이 살아나는 모험',
  description:
    '아이의 그림을 보송하고 귀여운 캐릭터로. 내가 만든 친구와 달빛 숲을 탐험하고, 우리의 선택이 담긴 동화책을 간직해요.',
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
