// 꼬맨틀 방식: 날짜마다 정해진 단어 하나를 모두가 함께 푼다.
export const WORDS = [
  "사과", "바나나", "수박", "딸기", "포도", "귤", "복숭아", "감자", "고구마", "당근",
  "양파", "마늘", "김치", "라면", "떡볶이", "김밥", "비빔밥", "치킨", "피자", "햄버거",
  "아이스크림", "초콜릿", "케이크", "빵", "우유", "커피", "녹차", "콜라", "계란", "두부",
  "강아지", "고양이", "호랑이", "사자", "코끼리", "기린", "펭귄", "토끼", "거북이", "돌고래",
  "상어", "고래", "독수리", "참새", "닭", "돼지", "소", "말", "원숭이", "개구리",
  "나비", "모기", "개미", "벌", "뱀", "곰", "판다", "여우", "늑대", "다람쥐",
  "자동차", "자전거", "비행기", "기차", "지하철", "버스", "배", "택시", "오토바이", "헬리콥터",
  "냉장고", "세탁기", "텔레비전", "컴퓨터", "스마트폰", "시계", "안경", "우산", "가방", "신발",
  "모자", "장갑", "목도리", "양말", "칫솔", "치약", "비누", "수건", "거울", "베개",
  "침대", "의자", "책상", "소파", "창문", "문", "열쇠", "전구", "선풍기", "에어컨",
  "연필", "지우개", "공책", "가위", "풀", "자", "책", "신문", "편지", "달력",
  "피아노", "기타", "북", "바이올린", "축구공", "야구", "농구", "수영", "스키", "태권도",
  "바다", "산", "강", "섬", "사막", "숲", "하늘", "구름", "비", "눈",
  "무지개", "태양", "달", "별", "번개", "바람", "화산", "폭포", "얼음", "불",
  "병원", "학교", "도서관", "공항", "편의점", "경찰", "소방관", "의사", "선생님", "요리사",
];
const STEP = 97; // WORDS.length(150)와 서로소여야 한 바퀴 동안 단어가 겹치지 않는다
const EPOCH = Date.UTC(2026, 9, 22, 15); // 2026-10-23 00:00 KST = #1
const DAY = 86_400_000;

export const dayNumber = (now = Date.now()) => Math.floor((now - EPOCH) / DAY) + 1;
export const wordOf = (n: number) => WORDS[(((n * STEP) % WORDS.length) + WORDS.length) % WORDS.length];

// 받침 유무로 조사 선택: josa("책", "을", "를") → "책을"
const josa = (w: string, withCoda: string, without: string) =>
  w + ((w.charCodeAt(w.length - 1) - 0xac00) % 28 ? withCoda : without);

export type Game = { day: number; secret: string; left: number; total: number; over: boolean };
export type Judge = (secret: string, message: string) => Promise<{ correct: number; yes: number }>;
// game: 새로 저장할 게임. 진행 중인 게임은 제자리에서 갱신되므로 비어 있다.
export type Reply = { game?: Game; text: string; buttons: string[] };

const IDLE = ["시작", "도움말"];
const PLAYING = ["포기", "도움말"];
const HELP =
  "다섯고개 🎯\n매일 새 단어 하나를 모두가 함께 맞혀요.\n" +
  "• 시작 (또는 '시작 10'처럼 고개 수 지정)\n" +
  "• 예/아니오로 답할 수 있는 질문을 하세요\n" +
  "• 정답 같으면 '사과야?'처럼 물어보세요\n" +
  "• 질문 하나당 한 고개, 포기하면 정답 공개";

export async function handle(game: Game | undefined, utterance: string, judge: Judge, now = Date.now()): Promise<Reply> {
  const msg = utterance.trim().replace(/^\//, "");
  const day = dayNumber(now);
  const today = game?.day === day ? game : undefined;

  if (msg === "도움말") return { text: HELP, buttons: today && !today.over ? PLAYING : IDLE };

  const start = msg.match(/^시작\s*(\d+)?$/);
  if (start) {
    if (today?.over) return { text: `오늘 문제(#${day})는 끝났어요. 내일 다시 도전하세요!`, buttons: ["도움말"] };
    if (today) return { text: `#${day} 진행 중 · 남은 고개 ${today.left}/${today.total}`, buttons: PLAYING };
    const total = Math.min(20, Math.max(1, Number(start[1] ?? 5)));
    return {
      game: { day, secret: wordOf(day), left: total, total, over: false },
      text: `#${day} 시작! 제가 생각한 단어를 ${total}고개 안에 맞혀 보세요.`,
      buttons: PLAYING,
    };
  }

  if (game && !today) return { text: `날짜가 바뀌어 새 문제(#${day})가 나왔어요. 시작을 눌러 주세요.`, buttons: IDLE };
  if (!today) return { text: "진행 중인 게임이 없어요. 시작을 눌러 주세요.", buttons: IDLE };
  if (today.over) return { text: `오늘 문제(#${day})는 끝났어요. 내일 다시 도전하세요!`, buttons: ["도움말"] };

  if (msg === "포기") {
    today.over = true;
    return { text: `정답은 '${josa(today.secret, "'이었어요", "'였어요")}. 내일 또 만나요!`, buttons: ["도움말"] };
  }

  let verdict;
  try {
    verdict = await judge(today.secret, msg);
  } catch {
    return { text: "잠시 후 다시 물어봐 주세요. (고개는 그대로예요)", buttons: PLAYING };
  }
  // 그룹방: 기다리는 사이 다른 사람이 끝냈을 수 있다
  if (today.over) return { text: `이미 끝났어요. 정답은 '${today.secret}'!`, buttons: ["도움말"] };
  today.left--;
  const used = today.total - today.left;

  if (verdict.correct >= 0.8) {
    today.over = true;
    return { text: `정답! 🎉 '${josa(today.secret, "'을", "'를")} ${used}고개 만에 맞혔어요.`, buttons: ["도움말"] };
  }
  const answer = verdict.yes >= 0.7 ? "예" : verdict.yes <= 0.3 ? "아니오" : "글쎄요";
  if (today.left === 0) {
    today.over = true;
    return { text: `${answer}.\n고개를 다 썼어요! 정답은 '${josa(today.secret, "'이었어요", "'였어요")}.`, buttons: ["도움말"] };
  }
  return { text: `${answer}.\n남은 고개 ${today.left}/${today.total}`, buttons: PLAYING };
}
