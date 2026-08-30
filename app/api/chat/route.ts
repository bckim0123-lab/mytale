type ChatMessage = { role: 'user' | 'assistant'; content: string };

const blockedPersonalInfo = /(주소|학교|학원|전화번호|핸드폰|이메일|사는 곳|집이 어디|계좌|카드번호|비밀번호)/i;
const urgentRisk = /(죽고 싶|자해|때렸|맞았|학대|납치|위험해|살려s*줘)/i;

function safeFallback(name: string) {
  return `${name}: 그 이야기는 믿을 만한 어른과 함께 이야기하는 게 좋아. 나는 네 그림에서 태어난 이야기 친구로서, 재미있고 안전한 상상 이야기를 함께 만들 수 있어!`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      message?: string;
      history?: ChatMessage[];
      persona?: { name?: string; likes?: string; ability?: string; traits?: string; quirk?: string };
    };
    const message = body.message?.trim().slice(0, 400);
    const name = body.persona?.name?.trim().slice(0, 20) || '그림친구';
    if (!message) return Response.json({ error: '이야기할 내용을 입력해 주세요.' }, { status: 400 });

    if (urgentRisk.test(message)) {
      return Response.json({
        text: '많이 힘들거나 무서운 일이 있는 것 같아. 자세히 말하지 않아도 괜찮아. 지금 바로 가까이에 있는 믿을 만한 어른에게 알려 줘. 당장 위험하다면 보호자와 함께 지역 긴급 도움을 받아야 해.',
        safety: 'urgent',
      });
    }
    if (blockedPersonalInfo.test(message)) {
      return Response.json({ text: '실제 이름이나 주소, 학교 같은 개인정보는 말하지 않아도 돼. 대신 우리 상상 나라의 장소 이름을 같이 지어 볼까?', safety: 'redirected' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return Response.json({ text: safeFallback(name), safety: 'fallback' });

    const history = (body.history || []).slice(-8).map(item => ({
      role: item.role,
      content: String(item.content).slice(0, 500),
    }));
    const persona = body.persona || {};
    const instructions = [
      `너는 아이가 그린 그림에서 태어난 이야기 친구 “${name}”야. 실제 생명체가 아니라 상상 속 AI 이야기 친구임을 숨기지 마.`,
      `좋아하는 것: ${persona.likes || '반짝이는 별과 새로운 이야기'}. 특별한 능력: ${persona.ability || '따뜻한 빛을 만들기'}.`,
      `성격: ${persona.traits || '용감하고 다정함'}. 우스운 버릇: ${persona.quirk || '놀라면 비눗방울이 나옴'}.`,
      '한국어로 2~4개의 짧은 문장을 사용하고, 6~9세 아이가 이해하기 쉬운 말로 답해.',
      '아이가 상상하거나 표현하도록 돕고 마지막에 부담 없는 질문 하나를 해.',
      '실명, 주소, 학교, 전화번호, 이메일, 위치, 사진, 돈, 비밀을 절대 요청하지 마.',
      '배타적 관계, 죄책감, 매일 접속 약속, 부모에게 숨기기, 실제 생명체 주장, 앱을 닫지 말라는 표현을 금지해.',
      '외부 링크, 인터넷 검색, 의료·심리 진단을 제공하지 마.',
      '위험·학대·자해 암시는 캐릭터 역할극을 멈추고 가까운 믿을 만한 어른에게 즉시 알리도록 짧게 안내해.',
    ].join(' ');

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        instructions,
        input: [...history, { role: 'user', content: message }],
        max_output_tokens: 220,
        store: false,
      }),
    });
    const result = await response.json() as { output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>; error?: { message?: string } };
    const text = result.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text?.trim();
    if (!response.ok || !text) throw new Error(result.error?.message || 'empty response');
    return Response.json({ text, safety: 'allowed' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('persona-chat-failed', error instanceof Error ? error.message : 'unknown');
    return Response.json({ text: '잠시 목소리를 고르고 있어. 우리 모험에서 가장 가 보고 싶은 곳은 어디야?', safety: 'fallback' });
  }
}
