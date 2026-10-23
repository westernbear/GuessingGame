# 다섯고개 카카오톡 챗봇

봇이 매일 단어 하나를 정하고(꼬맨틀 방식, KST 기준 `#n`), 사용자는 예/아니오 질문으로 맞힙니다. 질문 답변과 정답 판정은 [OpenCode Zen](https://opencode.ai/docs/zen)의 무료 **Jev 1.13**(`jev-1.13-free`, System One `noul` 질문)이 합니다. 1:1 채팅과 그룹방(팀채팅) 다인 플레이를 지원합니다.

- `시작` / `시작 10`: 오늘 문제 시작 (기본 5고개, 1~20)
- 아무 질문: 예 / 아니오 / 글쎄요, 질문 하나당 한 고개
- `포기`, `도움말`
- 그룹방은 방 전체가 한 게임과 고개를 공유하고, 먼저 맞힌 사람이 이깁니다. 하루 한 문제라 끝난 뒤에는 다음 날까지 다시 시작할 수 없습니다.

## 실행

```sh
npm install
PORT=8080 npm start   # POST /skill
npm test            # 게임 로직 테스트
npm run check       # 타입 체크
```

Node 23.6 이상이 필요합니다(`.ts`를 직접 실행). 런타임 의존성은 없습니다.

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `SKILL_SECRET` | (없음) | 설정하면 `x-skill-secret` 헤더가 같은 요청만 받습니다. 공개 배포 시 필수 |
| `JEV_MODEL` | `jev-1.13-free` | 유료 `jev-1.13`을 쓰려면 바꾸고 키를 넣습니다 |
| `OPENCODE_API_KEY` | (없음) | 있으면 `Authorization: Bearer`로 보냅니다 |
| `JEV_URL` | `https://opencode.ai/zen/v1/systemone` | 다른 System One 호환 엔드포인트(예: TypeSafe `https://api.typesafe.ai/v1/systemone`) |

> ⚠️ Zen 무료 등급은 "OpenCode 안에서만 사용"을 조건으로 합니다. chat/completions 엔드포인트는 실제로 외부 호출을 거부합니다. `systemone`은 현재 키 없이 응답하지만 언제든 막힐 수 있습니다. 실서비스에서는 `JEV_MODEL=jev-1.13`과 `OPENCODE_API_KEY`를 쓰세요. 게임 상태는 메모리에만 있어서, 재시작하면 진행 중인 게임이 사라집니다.

## Docker

```sh
cp .env.example .env        # SKILL_SECRET 등을 채운다
docker compose up -d --build                    # 127.0.0.1:${KBOT_PORT:-8080}
docker compose --profile tunnel up -d --build   # + Cloudflare Tunnel (TUNNEL_TOKEN 필요)
```

컨테이너는 non-root(`node`) 사용자로, 읽기 전용 파일시스템과 `cap_drop: ALL` 상태에서 실행합니다. 포트는 로컬에만 열어 두니, 외부 공개는 터널이나 리버스 프록시로 합니다. 터널을 쓸 때는 Cloudflare Zero Trust에서 public hostname(예: `kbot.westernbear.dev`)의 서비스를 `http://kbot:8080`으로 지정합니다.

## 1:1 챗봇 연결 (카카오 i 오픈빌더)

1. [챗봇 관리자센터](https://chatbot.kakao.com)에서 봇을 만들고 카카오톡 채널을 연결합니다.
2. **스킬**에 `https://<서버>/skill`을 등록하고, 헤더값에 `x-skill-secret: <SKILL_SECRET 값>`을 넣습니다.
3. **폴백 블록**의 응답을 이 스킬로 설정합니다. 그러면 모든 발화가 서버로 옵니다.
4. 배포합니다.

## 그룹 챗봇 연결 (일반채팅·팀채팅, Beta)

그룹 챗봇은 **카카오 제휴 심사**를 통과해야 만들 수 있습니다. 관리자센터 > 내 챗봇 > 그룹 챗봇 탭의 `신청하기`로 제안합니다(문의: chatbot@kakaocorp.com). 2026-10 기준 일반채팅(나와의 채팅 제외)과 팀채팅에서 동작합니다. 입점 기준은 유용한 정보, 그룹방 사용성, 서비스 안정성이고, 특정 방 전용·CS·단순 홍보 봇은 대상이 아닙니다.

1. 운영 채널과 **별도의 개발 채널**을 만들어 연결합니다. 개발 채널 봇은 테스트용 팀채팅방 1개에서만 동작합니다.
2. 1:1과 같은 `/skill`을 폴백 블록에 연결합니다. 서버는 `userRequest.chat.properties.botGroupKey`로 방을 구분합니다.
3. **봇 설명**을 14자 이내로 씁니다(예: `매일 다섯고개 퀴즈`). 팀채팅 봇 목록과 검색에 이 설명이 노출됩니다. **채널 공개**도 켭니다.
4. **봇 입장 블록**에 짧은 환영 문구와 "챗봇 멘션하기" 버튼을, **도움말 블록**에 규칙을 넣습니다.
5. 팀채팅방에서 봇을 추가한 뒤 `@봇이름 시작`으로 플레이합니다. 멘션이 없는 메시지는 봇에게 전달되지 않습니다. 카드 버튼을 누르면 멘션이 자동으로 붙습니다.

그룹방에서는 quickReplies가 표시되지 않아서, 응답은 모두 textCard 버튼으로 보냅니다.
