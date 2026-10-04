'use client';

import {
  Component,
  lazy,
  Suspense,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import type CompanionExperience from './companion-experience';
import './companion-entry.css';

type EntryProps = ComponentProps<typeof CompanionExperience> & {
  onBack: () => void;
  recoveryImage?: string | null;
};

/** Keep failures below Page, which still owns the approved generated images. */
export class CompanionLoadBoundary extends Component<
  {
    children: ReactNode;
    fallback: ReactNode;
  },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function CompanionEntryFallback({
  failed,
  image,
  onBack,
  onRetry,
}: {
  failed: boolean;
  image?: string | null;
  onBack: () => void;
  onRetry?: () => void;
}) {
  const approvedImage = image?.startsWith('data:image/png;base64,')
    ? image
    : null;
  return (
    <main className="companion-entry" aria-label="친구의 집 연결 안내">
      <section>
        {/* oxlint-disable-next-line next/no-img-element -- A validated local data URL must not pass through an external image optimizer. */}
        {approvedImage && <img src={approvedImage} alt="방금 만든 그림친구" />}
        <h1>
          {failed
            ? '친구의 집을 잠깐 열지 못했어요.'
            : '친구의 집으로 가는 중…'}
        </h1>
        <output>
          {approvedImage
            ? '만든 친구는 이 창에 그대로 있어요. 새로고침하기 전에는 그림을 먼저 저장해 주세요.'
            : failed
              ? '친구와 동화책을 지우지 않았어요. 연결을 확인한 뒤 다시 열어 주세요.'
              : '느린 연결에서는 조금 걸릴 수 있어요. 기다리지 않고 처음 화면으로 돌아가도 괜찮아요.'}
        </output>
        <div className="companion-entry-actions">
          {approvedImage && (
            <a href={approvedImage} download="그림친구.png">
              만든 친구 그림 저장
            </a>
          )}
          {failed && <button onClick={onRetry}>친구의 집 다시 열기</button>}
          <button className="companion-entry-back" onClick={onBack}>
            {approvedImage
              ? '만들기 화면으로 돌아가기'
              : '처음 화면으로 돌아가기'}
          </button>
        </div>
        {failed && <small>다시 열기는 캐릭터를 새로 생성하지 않아요.</small>}
      </section>
    </main>
  );
}

function createCompanionLoader(attempt = 0) {
  return { Screen: lazy(() => import('./companion-experience')), attempt };
}

export default function CompanionEntry({
  onBack,
  recoveryImage,
  ...props
}: EntryProps) {
  const [{ Screen, attempt }, setLoader] = useState(createCompanionLoader);
  // A failed React.lazy retains its rejection. Only an explicit retry creates
  // a fresh lazy loader; there is no automatic fetch loop or page reload.
  const image = props.incomingArtwork?.png ?? recoveryImage;
  return (
    <CompanionLoadBoundary
      key={attempt}
      fallback={
        <CompanionEntryFallback
          failed
          image={image}
          onBack={onBack}
          onRetry={() =>
            setLoader((value) => createCompanionLoader(value.attempt + 1))
          }
        />
      }
    >
      <Suspense
        fallback={
          <CompanionEntryFallback
            failed={false}
            image={image}
            onBack={onBack}
          />
        }
      >
        <Screen {...props} />
      </Suspense>
    </CompanionLoadBoundary>
  );
}
