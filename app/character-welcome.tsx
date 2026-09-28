'use client';
/* eslint-disable next/no-img-element -- Shared Sites/Vercel static transparent asset; explicit intrinsic size and fetch priority avoid layout shift. */

import { useState } from 'react';
import {
  ArrowRight,
  Heart,
  ImagePlus,
  Leaf,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import './character-welcome.css';

const greetings = [
  '안녕! 네 그림 속 친구는 어떤 모습이야?',
  '간질간질! 나도 너랑 친구가 되고 싶어.',
  '우리, 별빛 숲에 같이 가 볼까?',
];

export default function CharacterWelcome({
  onCreate,
  onPlay,
  generating = false,
}: {
  onCreate: () => void;
  onPlay: () => void;
  generating?: boolean;
}) {
  const [greeting, setGreeting] = useState(0);
  return (
    <section
      className="creation-welcome"
      aria-labelledby="creation-welcome-title"
    >
      <div className="creation-copy">
        <span className="creation-eyebrow">
          <Sparkles size={16} /> 작은 그림, 커다란 상상
        </span>
        <h1 id="creation-welcome-title">
          내가 그린 친구를
          <br />
          <em>꼭 안아 주고 싶어.</em>
        </h1>
        <p>
          삐뚤빼뚤한 선, 내가 고른 색.
          <br />내 그림의 매력을 담은 친구를 만나고,
          <br className="creation-mobile-break" /> 함께한 모험을 동화책으로
          간직해요.
        </p>
        <div className="creation-actions">
          <button className="creation-primary" onClick={onCreate}>
            <ImagePlus size={21} />
            {generating
              ? '만들고 있는 친구 보러 가기'
              : '내 그림으로 친구 만들기'}
            <ArrowRight size={20} />
          </button>
          <button className="creation-secondary" onClick={onPlay}>
            <Leaf size={18} /> 그림 없이 3D 친구와 먼저 놀기
          </button>
        </div>
        <p className="creation-care">
          <ShieldCheck size={17} /> 그림 전송은 보호자 확인 후 · 가입 없이 시작
        </p>
        <ol className="creation-journey" aria-label="내 그림으로 시작하는 모험">
          <li>
            <span>01</span>
            <b>내 그림 올리기</b>
            <small>사진이나 카메라로</small>
          </li>
          <li>
            <span>02</span>
            <b>친구 만나기</b>
            <small>보송 · 말랑 · 동화 스타일</small>
          </li>
          <li>
            <span>03</span>
            <b>우리 이야기 만들기</b>
            <small>직접 놀고, 책으로 간직해요</small>
          </li>
        </ol>
      </div>
      <div className="creation-showcase">
        <div className="creation-halo" aria-hidden="true" />
        <span className="creation-spark creation-spark-one" aria-hidden="true">
          ✦
        </span>
        <span className="creation-spark creation-spark-two" aria-hidden="true">
          ✧
        </span>
        <span
          className="creation-spark creation-spark-three"
          aria-hidden="true"
        >
          ✦
        </span>
        <output className="creation-greeting" aria-live="polite">
          {greetings[greeting % greetings.length]}
        </output>
        <button
          className="creation-mascot"
          aria-label="보송 친구 스타일 예시에게 인사하기"
          onClick={() => setGreeting((value) => value + 1)}
        >
          <span key={greeting} className={greeting ? 'creation-pop' : ''}>
            <img
              src="/style-plush-3d-v2.png"
              alt="둥근 눈과 작은 발, 연둣빛 잎을 가진 보송한 캐릭터 스타일 예시"
              width={1224}
              height={1285}
              fetchPriority="high"
            />
          </span>
        </button>
        <span className="creation-touch">
          <Heart size={14} /> 톡, 인사해 봐요
        </span>
        <p className="creation-sample-note">
          보송 3D 스타일 예시
          <br />
          <span>내 그림으로 만드는 결과는 각각 달라요.</span>
        </p>
      </div>
    </section>
  );
}
