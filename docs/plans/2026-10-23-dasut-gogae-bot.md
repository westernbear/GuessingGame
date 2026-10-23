# 다섯고개 카카오톡 챗봇 (Jev 판정, 1:1 + 그룹방 다인 플레이)

## Context
빈 폴더 `/home/singlerr/gamr`에 카카오톡 챗봇을 새로 만든다. 봇이 비밀 정답을 정하고, 사용자들은 예/아니오 질문을 던져 맞힌다.
- 질문 답변과 정답 판정은 TypeSafe **Jev**(`@typesafe-ai/sdk`의 `noul` 질문)가 맡는다.
- 기본 5고개이고, 고개 수는 바꿀 수 있다.
- 1:1 채팅과 **그룹방(팀채팅) 다인 플레이**를 모두 지원한다.

**사용자가 정한 것:** Jev 사용, 봇이 출제, 그룹방 다인 플레이, Regular 모드, AI 오케스트레이터.

**조사로 확인한 그룹 챗봇 사실** (카카오 그룹 챗봇 Beta 가이드와 실측 기록, 아래 출처):
- 1:1과 같은 스킬 서버를 쓴다.
  - 채팅방 식별자: `userRequest.chat.properties.botGroupKey` (그룹방에서만 있음)
  - 사용자 식별자: `userRequest.user.id` (= botUserKey)
- 그룹방에서는 `@봇` 멘션이 붙은 메시지만 전달된다. 발화에서 멘션은 제거된 채로 온다.
- 그룹방에서는 **quickReplies가 렌더링되지 않는다.** 카드 버튼은 동작하고, 버튼을 누르면 멘션이 자동으로 붙는다. 발화로는 버튼 **label**이 전송된다.
- 버튼 label은 최대 14자, 가로 2개 배치면 8자. textCard는 title과 description 합쳐 400자 이하.
- 스킬 응답은 5초 안에 와야 한다.
- 그룹 챗봇은 **팀채팅 전용 Beta**다. 카카오(chatbot@kakaocorp.com)에서 권한을 받아야 하고, 개발 채널을 따로 둬야 한다. 챗봇 관리자센터의 봇 설명(14자 이내)과 채널 공개 설정이 팀채팅 봇 목록 검색 노출에 영향을 준다. 이 내용은 README에 적는다.

**가정 (Ruling):**
- Ruling: Node 25에서 `.ts`를 네이티브 타입 스트리핑으로 바로 실행하고, 서버는 `node:http`로 짠다. 빌드 단계와 Express는 쓰지 않는다 (because 엔드포인트가 하나이고 의존성이 가장 적다).
- Ruling: 게임 키는 `botGroupKey ?? userId`로 한다 (because 그룹방은 방 하나에 게임 하나를 모두가 공유하고, 1:1은 사용자별로 게임을 둔다).
- Ruling: 그룹방에서는 고개를 방 전체가 공유한다. 누가 묻든 1고개를 차감하고, 처음 맞힌 사람이 승리한다 (because 전통 다섯고개 규칙이다). 차례 순서는 강제하지 않는다.
- Ruling: 응답은 1:1과 그룹 모두 `textCard` + 버튼(`시작`/`포기`/`도움말`, action `message`, label과 messageText 동일)으로 통일하고 quickReplies는 쓰지 않는다 (because 그룹방에서 렌더링되지 않는다).
- Ruling: 승자는 멘션하지 않고 "정답!"만 알린다 (because 멘션 응답의 JSON 형식은 공개 명세로 확인하지 못했다). 형식이 확인되면 추가한다.
- **정답 선정은 꼬맨틀 방식이다 (사용자 지정).** 하루에 한 문제를 낸다.
  - 문제 번호 `#n`은 KST 기준 시작일(2026-10-23 = #1)부터 센 날짜 수다.
  - 정답은 `WORDS[(n * STEP) % WORDS.length]`로 결정적으로 고른다. 모든 방과 사용자가 같은 날 같은 단어를 푼다.
  - Ruling: 단어는 코드 안 배열 약 150개, `STEP`은 배열 길이와 서로소인 상수로 둔다 (because 그러면 배열 길이만큼 날짜가 지나기 전에는 단어가 반복되지 않는다. 더 필요해지면 목록만 늘린다).
  - Ruling: 그날 문제를 이미 맞혔거나 포기했거나 고개를 다 쓴 키는 그날 다시 `시작`할 수 없다. "오늘의 #n은 끝났어요. 내일 다시 도전하세요"로 답한다 (because 정답이 같으니 다시 하는 의미가 없다). 날짜가 바뀌면 진행 중이던 게임도 새 문제로 갈아탄다.
- Ruling: 상태는 메모리 `Map`에 둔다 (because 재시작하면 진행 중인 게임만 사라진다. 필요해지면 Redis로 바꾼다).
- Ruling: 질문과 정답 시도 모두 1고개로 센다. Jev 호출이 실패하면 고개를 차감하지 않는다.
- Ruling: plan detail은 `tests`. 파일 3개짜리 한 줄기 작업이라 인라인으로 빌드하고, 끝에 `superlite:final-reviewer`로 리뷰한다.

## Design

### `src/game.ts`: 게임 로직, 판정 함수 주입
- 상태: `type Game = { day: number; secret: string; left: number; total: number; over: boolean }`
- 판정 함수: `type Judge = (secret: string, message: string) => Promise<{ correct: number; yes: number }>`
- 날짜 함수:
  - `dayNumber(now = Date.now())`: KST 기준 문제 번호 n
  - `wordOf(n)`: n번 문제의 정답. 테스트에서 결정성을 확인한다.
- 시그니처: `handle(game: Game | undefined, utterance: string, judge: Judge, now = Date.now()): Promise<{ game?: Game; text: string; buttons: string[] }>`
  - 끝난 게임도 그날은 남겨 둔다. 재도전을 막는 데 필요하기 때문이다.
- 명령:
  - `시작` / `시작 10`: 오늘의 문제 `#n`을 시작한다. N은 1~20으로 클램프하고 기본은 5다.
    - 오늘 게임이 이미 끝났으면 거부한다.
    - 진행 중이면 현재 상태를 다시 보여 준다.
  - `포기`: 정답을 공개하고 오늘 게임을 끝낸다.
  - `도움말`: 규칙을 안내한다.
  - 게임이 없을 때 그 밖의 발화가 오면 안내 문구와 `시작` 버튼을 보낸다.
- 그 밖의 발화는 질문 또는 정답 시도로 보고 judge를 한 번 호출한다.
  - `correct ≥ 0.8`이면 정답이다. 정답을 공개하고 게임을 끝낸다.
  - 아니면 `yes`가 0.7 이상이면 "예", 0.3 이하면 "아니오", 그 사이면 "글쎄요"로 답한다. 1고개를 차감하고 "남은 고개 n/N"을 표시한다.
  - 0고개가 되면 정답을 공개하고 끝낸다.
- 동시성 처리: judge를 await하는 동안 같은 방에서 다른 메시지가 게임을 끝내거나 새로 시작할 수 있다. await 후 `game.over`이거나 저장된 게임이 바뀌었으면 결과를 반영하지 않는다. 이 확인은 server가 `store.get(key) === game`으로 한다.

### `src/server.ts`
- `node:http`로 `POST /skill`을 받는다. 키는 `userRequest.chat?.properties?.botGroupKey ?? userRequest.user.id`다.
- `TypeSafeClient({ timeout: 3500, retry: { maxRetries: 0 } })`를 쓴다. 정확한 retry 필드명은 SDK의 `RetryPolicy` 타입을 보고 맞춘다.
- judge 구현은 `systemOne` 한 번 호출이다.
  - state: `{ secret, message }`
  - `correct: noul("사용자 메시지가 비밀 정답 자체(또는 동의어)를 지목하는가?")`
  - `yes: noul("사용자의 예/아니오 질문에 비밀 정답 기준으로 답하면 '예'인가?")`
- Jev 실패나 타임아웃이 나면 "잠시 후 다시 물어봐 주세요"로 답하고 고개는 그대로 둔다.
- 응답 형식: `{ version: "2.0", template: { outputs: [{ textCard: { description: text, buttons: buttons.map(l => ({ label: l, action: "message", messageText: l })) } }] } }`
- 그 밖의 경로는 404, JSON 파싱 오류는 400으로 처리한다. 포트는 `PORT`(기본 8080), 키는 `TYPESAFE_API_KEY` 환경변수에서 읽는다.

### 그 밖의 파일
- `package.json`: `type: module`, 의존성 `@typesafe-ai/sdk@0.7.0`, 스크립트 `start: node src/server.ts`, `test: node --test`
- `test/game.test.ts`: 가짜 judge로 다음을 확인하는 `node:test` 테스트
  - 시작(기본 5고개, `시작 10`, 범위 클램프)
  - 꼬맨틀 방식:
    - 같은 날은 같은 단어, 다음 날은 다른 단어
    - 배열 길이만큼은 날짜가 지나도 단어가 반복되지 않음
    - 끝난 날에는 재시작 거부, 날짜가 바뀌면 새 문제
  - 예/아니오/글쎄요 답변과 고개 차감
  - 정답 처리, 고개 소진, 포기, 게임 없을 때 안내
  - judge 실패 시 고개 유지
- `README.md`
  - 실행 방법
  - 오픈빌더 1:1 연결: 폴백 블록을 스킬에 연결
  - 그룹 챗봇 연결: 권한 신청, 개발 채널, 봇 입장/도움말 블록, 봇 설명 14자, 채널 공개, `@봇` 멘션으로 플레이

### 하지 않는 것
LLM 힌트 생성, 영속 저장소, 점수판과 랭킹, 차례 강제, 승자 멘션. 모두 요청받지 않았거나 명세로 확인하지 못했다.

## 실행 순서
1. `sl orchestrator set ai` 실행. 이 문서를 `docs/plans/2026-10-23-dasut-gogae-bot.md`로 복사한다.
2. TDD: `test/game.test.ts`를 먼저 쓰고 → `src/game.ts`를 구현해 통과시킨다.
3. `src/server.ts`, `package.json`, `README.md`를 작성하고 `npm install`을 실행한다.
4. 검증 (아래).
5. `.superlite/review-packet.md`를 작성하고 `superlite:final-reviewer`로 리뷰한다. 지적 사항을 고친다.

## 검증
- `npm test`: 전부 통과
- `npm start` 후 curl로 두 경우를 보낸다.
  - 1:1: `{"userRequest":{"utterance":"시작","user":{"id":"u1"}}}`
  - 그룹: `{"userRequest":{"utterance":"시작 7","user":{"id":"u1"},"chat":{"properties":{"botGroupKey":"g1"}}}}`
  - 그룹방에서 다른 사용자(`u2`)가 질문하면 같은 게임의 고개가 줄어드는지 확인한다.
  - 응답의 `version: "2.0"`, textCard, 버튼을 확인한다.
- `TYPESAFE_API_KEY`가 있으면 실제 Jev로 예/아니오 판정까지 확인한다. 없으면 이 단계는 건너뛰었다고 보고한다.
- 실제 팀채팅방 테스트는 카카오 그룹 챗봇 권한이 필요하므로 범위 밖이다. README에 절차만 적는다.

## 출처
- 그룹 챗봇 Beta 가이드 요약: github.com/dbwls99706/max-level-ant `docs/GROUP_CHATBOT_GUIDE.md`
- 실계정 계약 검증: github.com/dragon1086/prism-insight `docs/superpowers/specs/2026-07-27-kakao-live-contract-findings.md`
- Jev SDK: npm `@typesafe-ai/sdk@0.7.0` README와 타입 정의

## 변경 (사용자 지정): TypeSafe API 대신 OpenCode Zen `jev-1.13-free`
- `@typesafe-ai/sdk` 제거. Zen `POST https://opencode.ai/zen/v1/systemone`(System One 프로토콜)을 `fetch`로 직접 호출하고, 3.5초에 타임아웃.
- `JEV_URL` / `JEV_MODEL` / `OPENCODE_API_KEY`(선택) 환경변수로 바꿀 수 있다.
- Ruling: 무료 모델은 키 없이 보낸다 (because Zen systemone이 키 없이 응답했다). 단 Zen 무료 등급은 "OpenCode 안에서만 사용" 조건이고, chat/completions는 외부 호출을 거부한다. 실서비스는 유료 `jev-1.13`과 키를 쓰도록 README에 경고했다.
