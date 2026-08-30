'use client';

import { useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Camera, Check, ChevronRight, Compass, ImagePlus, LoaderCircle, LockKeyhole, MessageCircle, RotateCcw, Send, Settings, ShieldCheck, Sparkles, Star, Trash2, Upload, Volume2, WandSparkles } from 'lucide-react';

type Step = 'welcome' | 'guardian' | 'upload' | 'character' | 'chat' | 'adventure' | 'book' | 'parent';
const flow: { id: Step; label: string }[] = [
  { id: 'upload', label: '그림 올리기' }, { id: 'character', label: '친구 만나기' },
  { id: 'chat', label: '친구와 대화' }, { id: 'adventure', label: '함께 모험' }, { id: 'book', label: '동화책' },
];
const scenes = [
  ['1장 · 반짝이는 초대장', '달빛 숲에서 편지가 왔어요!', '별가루가 묻은 편지에는 “잃어버린 달빛 조각을 찾아 주세요”라고 적혀 있었어요.', ['별빛 지도를 펼쳐 본다', '숲속 친구에게 물어본다', '용감하게 발자국을 따라간다']],
  ['2장 · 속삭이는 갈림길', '세 갈래 길이 나타났어요', '왼쪽에서는 새들이 노래하고, 오른쪽에서는 작은 빛이 깜빡였어요.', ['새들의 노래를 따라간다', '깜빡이는 빛을 살펴본다', '둥근 발자국을 따라간다']],
  ['3장 · 작은 실수', '앗, 다리가 흔들려요!', '괜찮아요. 다시 천천히 방법을 찾아보면 돼요.', ['손을 꼭 잡고 천천히 간다', '튼튼한 나뭇가지를 찾는다', '별빛으로 다리를 비춘다']],
  ['4장 · 함께라면 할 수 있어', '구름 거인이 길을 막았어요', '구름 거인은 외로워서 길을 막고 있었어요. 마음을 알아주자 살며시 미소 지었어요.', ['함께 노래하자고 한다', '재미있는 이야기를 들려준다', '따뜻한 별빛을 선물한다']],
  ['5장 · 달빛이 돌아온 밤', '달빛 숲이 다시 반짝여요!', '힘을 합쳐 달빛 조각을 제자리에 놓았어요. 숲의 친구들이 집으로 가는 길을 밝혀 주었답니다.', ['모험을 동화책으로 만들기']],
] as const;
const adventureThemes = [
  { id: 'moon', icon: '🌙', title: '달빛 숲의 잃어버린 조각', desc: '반짝이는 숲을 구하는 따뜻한 협동 모험', color: 'forest' },
  { id: 'ocean', icon: '🐚', title: '노래를 잃은 산호 마을', desc: '바닷속 친구들과 비밀 노래를 되찾는 탐험', color: 'ocean' },
  { id: 'cloud', icon: '☁️', title: '구름섬의 거꾸로 비', desc: '하늘을 거슬러 오르는 빗방울의 수수께끼', color: 'cloud' },
  { id: 'space', icon: '🚀', title: '별씨앗 우체국', desc: '잠든 별들에게 빛나는 편지를 배달하는 여행', color: 'space' },
] as const;
const extraScenarios = [
  [
    ['1장 · 고요한 바다', '산호 마을의 노래가 사라졌어요', '조개 종이 울리지 않자 물고기 친구들이 길을 잃었어요.', ['반짝 비늘을 따라간다', '조개에게 귀를 기울인다', '친구들과 새 리듬을 만든다']],
    ['2장 · 거품 동굴', '노래 조각이 거품 속에 숨어요', '톡톡 터지는 거품마다 다른 음이 들려요.', ['낮은 음부터 맞춘다', '몸으로 리듬을 표현한다', '능력으로 거품을 비춘다']],
    ['3장 · 엉킨 해초', '해초 미로가 길을 바꿨어요', '틀린 길도 새로운 발견이 될 수 있어요.', ['물고기에게 도움을 청한다', '해초의 색 순서를 기억한다', '함께 손을 잡고 간다']],
    ['4장 · 외로운 고래', '마지막 음은 고래가 간직했어요', '고래는 자기 목소리가 너무 크다고 걱정했어요.', ['큰 목소리도 멋지다고 말한다', '함께 천천히 노래한다', '작은 악기를 선물한다']],
    ['5장 · 바다의 합창', '산호 마을이 다시 노래해요!', '서로 다른 목소리가 모여 세상에 하나뿐인 노래가 되었어요.', ['우리의 바다 모험을 책으로 만든다']],
  ],
  [
    ['1장 · 위로 내리는 비', '빗방울이 하늘로 올라가요!', '구름섬의 비가 거꾸로 흐르며 별을 간질이고 있었어요.', ['빗방울을 따라 점프한다', '바람 지도를 펼친다', '구름 새에게 물어본다']],
    ['2장 · 솜사탕 바람길', '바람 문이 빙글빙글 돌아요', '서로 다른 방향의 바람을 같은 박자로 맞춰야 해요.', ['손뼉으로 박자를 만든다', '친구와 동시에 버튼을 누른다', '능력으로 길을 표시한다']],
    ['3장 · 번개 실수', '앗, 작은 번개가 튀었어요', '실수로 구름이 깜짝 놀랐지만 천천히 달래면 괜찮아요.', ['미안하다고 말한다', '빗방울로 구름을 간질인다', '따뜻한 노래를 부른다']],
    ['4장 · 잠든 무지개', '무지개의 일곱 색을 깨워요', '각 색깔은 좋아하는 칭찬을 들으면 눈을 떠요.', ['멋진 점을 찾아 말한다', '색마다 별명을 지어 준다', '다 함께 춤을 춘다']],
    ['5장 · 포근한 소나기', '비가 제 길을 찾았어요!', '구름섬에 포근한 비가 내리고 커다란 무지개가 생겼어요.', ['구름섬 모험을 책으로 만든다']],
  ],
  [
    ['1장 · 반짝 우편함', '잠든 별들에게 편지가 왔어요', '별씨앗 우체국의 지도에 세 개의 불빛이 깜빡였어요.', ['가장 가까운 별부터 간다', '편지의 향기를 맡아 본다', '로켓에 재미있는 이름을 붙인다']],
    ['2장 · 재채기 행성', '행성이 재채기로 빙글 돌아요', '간지러운 우주 먼지를 치워야 착륙할 수 있어요.', ['부드러운 솔로 쓸어 준다', '재채기 박자를 센다', '능력으로 먼지를 모은다']],
    ['3장 · 길 잃은 혜성', '혜성이 집 방향을 잊었어요', '서두르지 않고 별자리를 하나씩 찾으면 돼요.', ['북쪽 별에게 물어본다', '지나온 길을 그림으로 남긴다', '혜성과 나란히 날아간다']],
    ['4장 · 까만 구멍의 수수께끼', '블랙홀이 편지를 삼켰어요', '사실 블랙홀은 자기에게 온 편지가 없어 외로웠대요.', ['새 편지를 함께 쓴다', '재미있는 그림을 선물한다', '모두의 답장을 약속한다']],
    ['5장 · 별씨앗 축제', '우주에 새 별이 피어났어요!', '배달한 편지마다 작은 별씨앗이 되어 밤하늘을 밝혔어요.', ['우주 배달 모험을 책으로 만든다']],
  ],
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
  const [theme, setTheme] = useState(0);
  const [page, setPage] = useState(0);
  const [duration, setDuration] = useState('12분');
  const [persona, setPersona] = useState({ name: '별콩이', likes: '반짝이는 별', ability: '따뜻한 별빛 만들기', traits: '용감하고 다정함', quirk: '놀라면 비눗방울이 나옴' });
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([{ role: 'assistant', content: '안녕! 나는 네 그림에서 태어난 AI 이야기 친구 별콩이야. 오늘 어떤 상상을 함께 만들어 볼까?' }]);
  const [chatInput, setChatInput] = useState('');
  const [chatting, setChatting] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const flowIndex = flow.findIndex(x => x.id === step);
  const load = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const source = new Image();
      source.onload = () => {
        const maxSide = 1600;
        const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(source.width * scale));
        canvas.height = Math.max(1, Math.round(source.height * scale));
        const context = canvas.getContext('2d');
        if (!context) return;
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        // Re-encoding keeps uploads light and strips camera metadata before transmission.
        setImage(canvas.toDataURL('image/jpeg', 0.88));
        setGenerated([]);
        setGenerationNote('');
      };
      source.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };
  const chosenImage = generated[pick] || image;
  const activeScenes = theme === 0 ? scenes : extraScenarios[theme - 1];
  const generateCharacter = async () => {
    if (!image || generating) return;
    setGenerating(true); setGenerationNote('그림의 색과 특별한 모양을 살펴보고 있어요…');
    try {
      const blob = await fetch(image).then(r => r.blob());
      const form = new FormData(); form.append('drawing', blob, 'drawing.png');
      const response = await fetch('/api/character', { method: 'POST', body: form });
      const data = await response.json() as { images?: string[]; message?: string; error?: string };
      const validImages = data.images?.filter(Boolean) || [];
      if (!response.ok || !validImages.length) throw new Error(data.error || '변환 실패');
      setGenerated(data.images || []);
      setGenerationNote(data.message || '그림의 특징을 살린 친구들이 태어났어요!');
      setStep('character');
    } catch (error) { setGenerationNote(error instanceof Error ? error.message : '캐릭터 변환에 실패했어요. 다시 시도해 주세요.'); }
    finally { setGenerating(false); }
  };
  const sendChat = async () => {
    const text = chatInput.trim(); if (!text || chatting) return;
    const next = [...messages, { role: 'user' as const, content: text }]; setMessages(next); setChatInput(''); setChatting(true);
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, history: messages, persona }) });
      const data = await response.json() as { text?: string };
      setMessages([...next, { role: 'assistant', content: data.text || '잠시 생각을 고르고 있어. 다시 말해 줄래?' }]);
    } catch { setMessages([...next, { role: 'assistant', content: '목소리를 잠깐 고르고 있어. 우리 모험에서 가장 가고 싶은 곳은 어디야?' }]); }
    finally { setChatting(false); }
  };
  const reset = () => { setImage(null); setGenerated([]); setGenerationNote(''); setPick(0); setScene(0); setTheme(0); setPage(0); setStep('welcome'); };

  return <main className="app">
    <header><button className="logo-button" onClick={() => setStep('welcome')}><Logo /></button>
      {flowIndex >= 0 && <div className="progress"><div>{flow.map((x, i) => <span className={i <= flowIndex ? 'on' : ''} key={x.id}>{x.label}</span>)}</div><i><b style={{ width: `${((flowIndex + 1) / flow.length) * 100}%` }} /></i></div>}
      <button className="parent" onClick={() => setStep('parent')}><LockKeyhole size={15} /> 보호자</button>
    </header>

    {step === 'welcome' && <section className="welcome"><div className="welcome-copy"><span className="badge"><Sparkles size={15} /> 아이의 그림이 살아나는 시간</span><h1>내가 그린 그림이<br /><em>진짜 이야기 친구</em>가 돼요</h1><p>그림을 올리고, 나만의 친구와 짧은 모험을 떠나 보세요.<br />모험이 끝나면 우리 이야기가 한 권의 동화책으로 남아요.</p><div className="welcome-action"><Button onClick={() => setStep('guardian')}><WandSparkles size={21} /> 그림친구 만들기 <ChevronRight /></Button><span><ShieldCheck size={18} /> 보호자와 함께 시작해요</span></div></div><div className="stage"><div className="paper"><span /><Friend /><b>내 친구 별콩이!</b></div><div className="bubble">안녕! 네 그림에서<br />태어난 이야기 친구야 ✦</div><i className="spark">✦</i></div></section>}

    {step === 'guardian' && <section className="center narrow"><button className="back" onClick={() => setStep('welcome')}><ArrowLeft size={18} /> 처음으로</button><span className="badge"><ShieldCheck size={17} /> 보호자 설정 · 데모</span><h2>아이에게 안전한 모험을<br />준비해 주세요</h2><p>그림은 캐릭터 변환을 위해서만 AI로 전송하며 서비스에 저장하지 않아요.</p><div className="guardian-card"><label>아이 연령대 <select defaultValue="6–9세"><option>6–9세</option><option>10–12세</option></select></label><label>한 번의 모험 시간 <select value={duration} onChange={e => setDuration(e.target.value)}><option>8분</option><option>12분</option><option>15분</option></select></label><div className="consent"><Camera /><span><b>사진 사용</b><small>캐릭터를 만드는 동안만 OpenAI API로 전송</small></span><i className="toggle on" /></div><aside><LockKeyhole /><span><b>우리의 약속</b><br />위치 정보는 요청하지 않고, 업로드한 원본과 대화는 서비스에 저장하지 않아요.</span></aside></div><Button onClick={() => setStep('upload')}>안전 설정 완료 <ChevronRight /></Button></section>}

    {step === 'upload' && <section className="center upload"><span className="badge">첫 번째 마법</span><h2>그림을 보여 주세요!</h2><p>종이 전체가 잘 보이고, 밝은 곳에서 찍은 사진이 좋아요.</p><input ref={input} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e => load(e.target.files?.[0])} /><div className={`drop ${image ? 'filled' : ''}`} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); load(e.dataTransfer.files[0]); }}>{image ? <img src={image} alt="업로드한 아이의 그림" /> : <><span><ImagePlus /></span><b>여기에 그림을 놓아 주세요</b><small>또는 아래 버튼으로 사진을 골라요</small></>}</div><div className="upload-buttons"><Button secondary onClick={() => input.current?.click()}><Upload size={19} /> {image ? '다른 그림 고르기' : '그림 파일 고르기'}</Button><Button secondary onClick={() => input.current?.click()}><Camera size={19} /> 사진 찍기</Button></div>{image && <strong className="quality"><Check /> 그림이 선명하고 잘 보이네요!</strong>}<Button disabled={!image || generating} onClick={generateCharacter}>{generating ? <LoaderCircle className="spin" size={19} /> : <Sparkles size={19} />} {generating ? '친구가 태어나는 중…' : 'AI 캐릭터로 탄생시키기'}</Button>{generating && <div className="magic-progress"><i /><span>{generationNote}</span></div>}{!generating && generationNote && <div className="generation-error">{generationNote}</div>}<small className="privacy"><LockKeyhole size={14} /> 그림은 캐릭터 생성에만 사용하며 장기 저장하지 않아요.</small></section>}

    {step === 'character' && <section className="center characters">
      <span className="badge">짜잔! 그림친구가 태어났어요</span><h2>원본의 특징을 살린 진짜 캐릭터예요</h2><p>{generationNote}</p>
      <div className="transform-proof"><article><small>아이의 원본 그림</small>{image && <img src={image} alt="변환 전 원본 그림" />}</article><span><WandSparkles /> AI 변환</span><article><small>선택한 캐릭터</small><Friend image={generated[pick]} /></article></div>
      <h3 className="choose-title">가장 마음에 드는 모습을 골라 주세요</h3>
      <div className="candidates">{['그림 그대로', '말랑 캐릭터', '쪼꼬미 인형'].map((name, i) => <button disabled={!generated[i]} className={pick === i ? 'selected' : ''} key={name} onClick={() => setPick(i)}>{pick === i && <i className="check"><Check /></i>}<span>{generated[i] ? <Friend image={generated[i]} variant={`v${i}`} /> : <LoaderCircle className="spin" />}</span><b>{name}</b><small>{i === 0 ? '내 선을 가장 많이 살렸어요' : i === 1 ? '포근하고 둥근 느낌이에요' : '작은 몸에 표정이 커요'}</small></button>)}</div>
      <div className="persona-card"><h3><MessageCircle /> 친구의 마음을 만들어 주세요</h3><div><label>이름<input value={persona.name} onChange={e => setPersona({ ...persona, name: e.target.value })} /></label><label>좋아하는 것<input value={persona.likes} onChange={e => setPersona({ ...persona, likes: e.target.value })} /></label><label>특별한 능력<input value={persona.ability} onChange={e => setPersona({ ...persona, ability: e.target.value })} /></label><label>성격 두 가지<input value={persona.traits} onChange={e => setPersona({ ...persona, traits: e.target.value })} /></label><label>우스운 버릇<input value={persona.quirk} onChange={e => setPersona({ ...persona, quirk: e.target.value })} /></label></div></div>
      <Button onClick={() => { setMessages([{ role: 'assistant', content: `안녕! 나는 네 그림에서 태어난 AI 이야기 친구 ${persona.name}야. 오늘 어떤 상상을 함께 만들어 볼까?` }]); setStep('chat'); }}><MessageCircle /> {persona.name}와 대화 시작하기 <ChevronRight /></Button>
    </section>}

    {step === 'chat' && <section className="chat-view">
      <aside className="chat-persona"><Friend image={chosenImage} /><span className="online"><i /> 이야기할 준비 완료</span><h2>{persona.name}</h2><p>{persona.traits}</p><dl><div><dt>좋아하는 것</dt><dd>{persona.likes}</dd></div><div><dt>특별한 능력</dt><dd>{persona.ability}</dd></div><div><dt>우스운 버릇</dt><dd>{persona.quirk}</dd></div></dl><small><ShieldCheck /> 개인정보나 비밀을 묻지 않는 안전한 AI 친구예요.</small></aside>
      <div className="chat-main"><header><div><MessageCircle /><span><b>{persona.name}와 이야기</b><small>상상 이야기 · 안전 모드</small></span></div><Button secondary onClick={() => { setScene(-1); setStep('adventure'); }}><Compass /> 모험 고르기</Button></header><div className="messages">{messages.map((m, i) => <div key={i} className={`message ${m.role}`}><span>{m.role === 'assistant' ? <Friend image={chosenImage} /> : '나'}</span><p>{m.content}</p></div>)}{chatting && <div className="message assistant"><span><Friend image={chosenImage} /></span><p className="typing"><i /><i /><i /></p></div>}</div><div className="quick-prompts">{['오늘 기분이 어때?', '우리만의 비밀 기지를 만들자', '재미있는 능력을 보여 줘'].map(x => <button key={x} onClick={() => setChatInput(x)}>{x}</button>)}</div><form onSubmit={e => { e.preventDefault(); sendChat(); }}><input aria-label="그림친구에게 할 말" placeholder={`${persona.name}에게 하고 싶은 말을 적어 보세요`} value={chatInput} onChange={e => setChatInput(e.target.value)} maxLength={400} /><button disabled={!chatInput.trim() || chatting} aria-label="메시지 보내기"><Send /></button></form></div>
    </section>}

    {step === 'adventure' && (scene < 0 ? <section className="center adventure-picker"><span className="badge"><Compass /> 오늘의 모험을 골라요</span><h2>어디로 떠나 볼까요?</h2><p>모든 모험은 5개의 장면으로 끝나고, 함께 생각하고 도우며 해결해요.</p><div className="theme-grid">{adventureThemes.map((item, i) => <button key={item.id} className={item.color} onClick={() => { setTheme(i); setScene(0); }}><i>{item.icon}</i><span><b>{item.title}</b><small>{item.desc}</small></span><ChevronRight /></button>)}</div><button className="back-to-chat" onClick={() => setStep('chat')}><MessageCircle /> 대화를 조금 더 할래요</button></section> : <section className="adventure"><div className="adventure-meta"><b>{adventureThemes[theme].title}</b><span>{scene + 1} / 5 장면 · 약 {duration}</span></div><div className={`scene s${scene} theme-${adventureThemes[theme].color}`}><i className="moon">{adventureThemes[theme].icon}</i><i className="stars">✦　·　✧</i><div className="scene-friend"><Friend image={chosenImage} /></div><article><span>{activeScenes[scene][0]}</span><h2>{activeScenes[scene][1]}</h2><p>{activeScenes[scene][2]}</p></article></div><div className="choice-card"><div className="says"><Volume2 /> “{scene === 4 ? '우리가 해냈어! 오늘의 모험을 책으로 남기자.' : '좋은 생각이야! 어떤 방법으로 해 볼까?'}”</div><div className="choices">{activeScenes[scene][3].map((x, i) => <button key={x} onClick={() => scene < 4 ? setScene(scene + 1) : setStep('book')}><i>{String.fromCharCode(65 + i)}</i>{x}<ChevronRight /></button>)}</div><button className="speak"><Mic /> 누르고 말해서 다른 방법 알려주기</button><small className="event"><Sparkles /> 안전한 이야기 사건 {scene + 1}개가 기록되었어요</small></div></section>)}

    {step === 'book' && <section className="book"><div className="book-title"><span className="badge"><BookOpen /> 모험 완성!</span><h2>우리의 첫 동화책이 만들어졌어요</h2><p>자유 대화가 아닌 안전하게 확인된 이야기만 담았어요.</p></div><div className="book-shell"><button disabled={page === 0} onClick={() => setPage(page - 1)}><ArrowLeft /></button><article><small>{pages[page][0]}</small><div className="book-art"><i>☾</i><Friend image={chosenImage} /></div><h3>{pages[page][1]}</h3><p>{pages[page][2]}</p><b>{page + 1}</b></article><button disabled={page === 5} onClick={() => setPage(page + 1)}><ChevronRight /></button></div><div className="dots">{pages.map((_, i) => <button className={i === page ? 'on' : ''} key={i} onClick={() => setPage(i)} />)}</div><div className="book-buttons"><Button secondary onClick={() => setPage(0)}><RotateCcw /> 처음부터 읽기</Button><Button onClick={() => setStep('parent')}><ShieldCheck /> 보호자에게 보여주기</Button></div></section>}

    {step === 'parent' && <section className="center parent-view"><span className="badge"><Settings /> 보호자 공간 · 데모</span><h2>아이의 창작물을 관리해요</h2><p>저장된 콘텐츠를 확인하고 언제든 삭제할 수 있어요.</p><div className="parent-list"><article><i>★</i><span><b>별콩이</b><small>캐릭터 1개 · 오늘 생성</small></span><button onClick={() => setStep(image ? 'character' : 'upload')}>보기</button></article><article><i>▤</i><span><b>별콩이와 달빛 숲</b><small>동화책 1권 · 6페이지</small></span><button onClick={() => setStep('book')}>읽기</button></article><article><i>✓</i><span><b>개인정보 보호</b><small>원본 음성 없음 · 위치 정보 없음</small></span><button>설정</button></article></div><div className="summary"><b>오늘의 모험</b><span>완료한 장면<strong>{scene + 1}</strong></span><span>이야기 사건<strong>{scene + 1}</strong></span><span>사용 시간<strong>약 {Math.min(scene + 2, 9)}분</strong></span></div><div className="parent-actions"><Button secondary onClick={() => setStep(image ? 'character' : 'upload')}><Sparkles /> 아이 모드로 돌아가기</Button><button className="danger" onClick={reset}><Trash2 /> 모든 데모 데이터 삭제</button></div></section>}
  </main>;
}
