'use client';

import { useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Camera, Check, ChevronRight, ImagePlus, LoaderCircle, LockKeyhole, Mic, RotateCcw, Settings, ShieldCheck, Sparkles, Star, Trash2, Upload, Volume2, WandSparkles } from 'lucide-react';

type Step = 'welcome' | 'guardian' | 'upload' | 'character' | 'adventure' | 'book' | 'parent';
const flow: { id: Step; label: string }[] = [
  { id: 'upload', label: '그림 올리기' }, { id: 'character', label: '친구 만나기' },
  { id: 'adventure', label: '함께 모험' }, { id: 'book', label: '동화책' },
];
const scenes = [
  ['1장 · 반짝이는 초대장', '달빛 숲에서 편지가 왔어요!', '별가루가 묻은 편지에는 “잃어버린 달빛 조각을 찾아 주세요”라고 적혀 있었어요.', ['별빛 지도를 펼쳐 본다', '숲속 친구에게 물어본다', '용감하게 발자국을 따라간다']],
  ['2장 · 속삭이는 갈림길', '세 갈래 길이 나타났어요', '왼쪽에서는 새들이 노래하고, 오른쪽에서는 작은 빛이 깜빡였어요.', ['새들의 노래를 따라간다', '깜빡이는 빛을 살펴본다', '둥근 발자국을 따라간다']],
  ['3장 · 작은 실수', '앗, 다리가 흔들려요!', '괜찮아요. 다시 천천히 방법을 찾아보면 돼요.', ['손을 꼭 잡고 천천히 간다', '튼튼한 나뭇가지를 찾는다', '별빛으로 다리를 비춘다']],
  ['4장 · 함께라면 할 수 있어', '구름 거인이 길을 막았어요', '구름 거인은 외로워서 길을 막고 있었어요. 마음을 알아주자 살며시 미소 지었어요.', ['함께 노래하자고 한다', '재미있는 이야기를 들려준다', '따뜻한 별빛을 선물한다']],
  ['5장 · 달빛이 돌아온 밤', '달빛 숲이 다시 반짝여요!', '힘을 합쳐 달빛 조각을 제자리에 놓았어요. 숲의 친구들이 집으로 가는 길을 밝혀 주었답니다.', ['모험을 동화책으로 만들기']],
] as const;
const pages = [
  ['표지', '별콩이와 달빛 숲', '우리 둘이 함께 만든 첫 번째 모험'],
  ['친구 소개', '안녕, 나는 별콩이야!', '용감하고 다정하며, 놀라면 귀에서 비눗방울이 나와요.'],
  ['모험의 시작', '별가루 편지가 도착했어요', '달빛 숲의 빛이 사라졌다는 소식이었어요.'],
  ['첫 번째 도전', '흔들리는 다리를 건너요', '서두르지 않고 서로 손을 잡으니 무사히 건널 수 있었어요.'],
  ['함께 해결하기', '구름 거인의 마음을 밝혀요', '따뜻한 별빛을 나누자 구름 거인이 길을 열어 주었어요.'],
  ['집으로', '달빛이 돌아왔어요!', '우리는 반짝이는 길을 따라 집으로 돌아왔답니다.'],
];

function Logo() { return <span className="logo"><Star fill="currentColor" />그림친구</span>; }
function Friend({ image, variant = '' }: { image?: string | null; variant?: string }) {
  return image ? <img className={`friend-image ${variant}`} src={image} alt="내 그림으로 만든 캐릭터" /> : (
    <div className={`friend ${variant}`} aria-label="별콩이 캐릭터"><i>★</i><i>★</i><b>• ᴗ •</b><small>●　●</small></div>
  );
}
function Button({ children, onClick, secondary = false, disabled = false }: { children: React.ReactNode; onClick?: () => void; secondary?: boolean; disabled?: boolean }) {
  return <button className={secondary ? 'button secondary' : 'button'} onClick={onClick} disabled={disabled}>{children}</button>;
}

export default function Home() {
  const [step, setStep] = useState<Step>('welcome');
  const [image, setImage] = useState<string | null>(null);
  const [generated, setGenerated] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generationNote, setGenerationNote] = useState('');
  const [pick, setPick] = useState(0);
  const [scene, setScene] = useState(0);
  const [page, setPage] = useState(0);
  const [duration, setDuration] = useState('12분');
  const input = useRef<HTMLInputElement>(null);
  const flowIndex = flow.findIndex(x => x.id === step);
  const load = (file?: File) => { if (!file) return; const r = new FileReader(); r.onload = () => { setImage(String(r.result)); setGenerated([]); setGenerationNote(''); }; r.readAsDataURL(file); };
  const chosenImage = generated[pick] || image;
  const generateCharacter = async () => {
    if (!image || generating) return;
    setGenerating(true); setGenerationNote('그림의 색과 특별한 모양을 살펴보고 있어요…');
    try {
      const blob = await fetch(image).then(r => r.blob());
      const form = new FormData(); form.append('drawing', blob, 'drawing.png');
      const response = await fetch('/api/character', { method: 'POST', body: form });
      const data = await response.json() as { images?: string[]; message?: string; error?: string };
      if (data.images?.length) setGenerated(data.images);
      setGenerationNote(data.message || data.error || (data.images?.length ? '그림의 특징을 살린 세 친구가 태어났어요!' : '원본 그림으로 친구를 준비했어요.'));
      setStep('character');
    } catch { setGenerationNote('연결이 잠시 쉬고 있어 원본 그림으로 계속할게요.'); setStep('character'); }
    finally { setGenerating(false); }
  };
  const reset = () => { setImage(null); setGenerated([]); setGenerationNote(''); setPick(0); setScene(0); setPage(0); setStep('welcome'); };

  return <main className="app">
    <header><button className="logo-button" onClick={() => setStep('welcome')}><Logo /></button>
      {flowIndex >= 0 && <div className="progress"><div>{flow.map((x, i) => <span className={i <= flowIndex ? 'on' : ''} key={x.id}>{x.label}</span>)}</div><i><b style={{ width: `${(flowIndex + 1) * 25}%` }} /></i></div>}
      <button className="parent" onClick={() => setStep('parent')}><LockKeyhole size={15} /> 보호자</button>
    </header>

    {step === 'welcome' && <section className="welcome"><div className="welcome-copy"><span className="badge"><Sparkles size={15} /> 아이의 그림이 살아나는 시간</span><h1>내가 그린 그림이<br /><em>진짜 이야기 친구</em>가 돼요</h1><p>그림을 올리고, 나만의 친구와 짧은 모험을 떠나 보세요.<br />모험이 끝나면 우리 이야기가 한 권의 동화책으로 남아요.</p><div className="welcome-action"><Button onClick={() => setStep('guardian')}><WandSparkles size={21} /> 그림친구 만들기 <ChevronRight /></Button><span><ShieldCheck size={18} /> 보호자와 함께 시작해요</span></div></div><div className="stage"><div className="paper"><span /><Friend /><b>내 친구 별콩이!</b></div><div className="bubble">안녕! 네 그림에서<br />태어난 이야기 친구야 ✦</div><i className="spark">✦</i></div></section>}

    {step === 'guardian' && <section className="center narrow"><button className="back" onClick={() => setStep('welcome')}><ArrowLeft size={18} /> 처음으로</button><span className="badge"><ShieldCheck size={17} /> 보호자 설정 · 데모</span><h2>아이에게 안전한 모험을<br />준비해 주세요</h2><p>이 데모에서는 어떤 데이터도 서버로 보내거나 저장하지 않아요.</p><div className="guardian-card"><label>아이 연령대 <select defaultValue="6–9세"><option>6–9세</option><option>10–12세</option></select></label><label>한 번의 모험 시간 <select value={duration} onChange={e => setDuration(e.target.value)}><option>8분</option><option>12분</option><option>15분</option></select></label><div className="consent"><Camera /><span><b>사진 사용</b><small>캐릭터를 만드는 동안만 사용</small></span><i className="toggle on" /></div><div className="consent"><Mic /><span><b>마이크</b><small>누르고 말할 때만 켜짐</small></span><i className="toggle" /></div><aside><LockKeyhole /><span><b>우리의 약속</b><br />위치 정보와 원본 음성은 저장하지 않으며, 아이의 콘텐츠는 모델 학습에 사용하지 않아요.</span></aside></div><Button onClick={() => setStep('upload')}>안전 설정 완료 <ChevronRight /></Button></section>}

    {step === 'upload' && <section className="center upload"><span className="badge">첫 번째 마법</span><h2>그림을 보여 주세요!</h2><p>종이 전체가 잘 보이고, 밝은 곳에서 찍은 사진이 좋아요.</p><input ref={input} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e => load(e.target.files?.[0])} /><div className={`drop ${image ? 'filled' : ''}`} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); load(e.dataTransfer.files[0]); }}>{image ? <img src={image} alt="업로드한 아이의 그림" /> : <><span><ImagePlus /></span><b>여기에 그림을 놓아 주세요</b><small>또는 아래 버튼으로 사진을 골라요</small></>}</div><div className="upload-buttons"><Button secondary onClick={() => input.current?.click()}><Upload size={19} /> {image ? '다른 그림 고르기' : '그림 파일 고르기'}</Button><Button secondary onClick={() => input.current?.click()}><Camera size={19} /> 사진 찍기</Button></div>{image && <strong className="quality"><Check /> 그림이 선명하고 잘 보이네요!</strong>}<Button disabled={!image || generating} onClick={generateCharacter}>{generating ? <LoaderCircle className="spin" size={19} /> : <Sparkles size={19} />} {generating ? '친구가 태어나는 중…' : 'AI 캐릭터로 탄생시키기'}</Button>{generating && <div className="magic-progress"><i /><span>{generationNote}</span></div>}<small className="privacy"><LockKeyhole size={14} /> 그림은 캐릭터 생성에만 사용하며 장기 저장하지 않아요.</small></section>}

    {step === 'character' && <section className="center characters"><span className="badge">짜잔! 그림친구가 태어났어요</span><h2>어떤 모습이 가장 마음에 드나요?</h2><p>{generationNote || '원래 그림의 색과 표정, 특별한 모양을 그대로 간직했어요.'}</p><div className="candidates">{['그림 그대로', '말랑 캐릭터', '쪼꼬미 인형'].map((name, i) => <button className={pick === i ? 'selected' : ''} key={name} onClick={() => setPick(i)}>{pick === i && <i className="check"><Check /></i>}<span><Friend image={generated[i] || image} variant={`v${i}`} /></span><b>{name}</b><small>{i === 0 ? '내 선을 가장 많이 살렸어요' : i === 1 ? '포근하고 둥근 느낌이에요' : '작은 몸에 표정이 커요'}</small></button>)}</div><div className="name"><label>친구 이름<input defaultValue="별콩이" /></label><span>용감해요</span><span>다정해요</span><span>별빛 능력</span></div><Button onClick={() => { setScene(0); setStep('adventure'); }}>별콩이와 모험 떠나기 <ChevronRight /></Button></section>}

    {step === 'adventure' && <section className="adventure"><div className="adventure-meta"><b>달빛 숲의 잃어버린 조각</b><span>{scene + 1} / 5 장면 · 약 {duration}</span></div><div className={`scene s${scene}`}><i className="moon">☾</i><i className="stars">✦　·　✧</i><div className="scene-friend"><Friend image={chosenImage} /></div><article><span>{scenes[scene][0]}</span><h2>{scenes[scene][1]}</h2><p>{scenes[scene][2]}</p></article></div><div className="choice-card"><div className="says"><Volume2 /> “{scene === 4 ? '우리가 해냈어! 오늘의 모험을 책으로 남기자.' : '좋은 생각이야! 어떤 방법으로 해 볼까?'}”</div><div className="choices">{scenes[scene][3].map((x, i) => <button key={x} onClick={() => scene < 4 ? setScene(scene + 1) : setStep('book')}><i>{String.fromCharCode(65 + i)}</i>{x}<ChevronRight /></button>)}</div><button className="speak"><Mic /> 누르고 말해서 다른 방법 알려주기</button><small className="event"><Sparkles /> 안전한 이야기 사건 {scene + 1}개가 기록되었어요</small></div></section>}

    {step === 'book' && <section className="book"><div className="book-title"><span className="badge"><BookOpen /> 모험 완성!</span><h2>우리의 첫 동화책이 만들어졌어요</h2><p>자유 대화가 아닌 안전하게 확인된 이야기만 담았어요.</p></div><div className="book-shell"><button disabled={page === 0} onClick={() => setPage(page - 1)}><ArrowLeft /></button><article><small>{pages[page][0]}</small><div className="book-art"><i>☾</i><Friend image={chosenImage} /></div><h3>{pages[page][1]}</h3><p>{pages[page][2]}</p><b>{page + 1}</b></article><button disabled={page === 5} onClick={() => setPage(page + 1)}><ChevronRight /></button></div><div className="dots">{pages.map((_, i) => <button className={i === page ? 'on' : ''} key={i} onClick={() => setPage(i)} />)}</div><div className="book-buttons"><Button secondary onClick={() => setPage(0)}><RotateCcw /> 처음부터 읽기</Button><Button onClick={() => setStep('parent')}><ShieldCheck /> 보호자에게 보여주기</Button></div></section>}

    {step === 'parent' && <section className="center parent-view"><span className="badge"><Settings /> 보호자 공간 · 데모</span><h2>아이의 창작물을 관리해요</h2><p>저장된 콘텐츠를 확인하고 언제든 삭제할 수 있어요.</p><div className="parent-list"><article><i>★</i><span><b>별콩이</b><small>캐릭터 1개 · 오늘 생성</small></span><button onClick={() => setStep(image ? 'character' : 'upload')}>보기</button></article><article><i>▤</i><span><b>별콩이와 달빛 숲</b><small>동화책 1권 · 6페이지</small></span><button onClick={() => setStep('book')}>읽기</button></article><article><i>✓</i><span><b>개인정보 보호</b><small>원본 음성 없음 · 위치 정보 없음</small></span><button>설정</button></article></div><div className="summary"><b>오늘의 모험</b><span>완료한 장면<strong>{scene + 1}</strong></span><span>이야기 사건<strong>{scene + 1}</strong></span><span>사용 시간<strong>약 {Math.min(scene + 2, 9)}분</strong></span></div><div className="parent-actions"><Button secondary onClick={() => setStep(image ? 'character' : 'upload')}><Sparkles /> 아이 모드로 돌아가기</Button><button className="danger" onClick={reset}><Trash2 /> 모든 데모 데이터 삭제</button></div></section>}
  </main>;
}
