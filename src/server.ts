import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { dayNumber, handle, type Game, type Judge } from "./game.ts";

// 오픈빌더 스킬의 헤더값에 x-skill-secret을 넣어 카카오가 아닌 호출을 막는다
const SECRET = process.env.SKILL_SECRET;
if (!SECRET) console.warn("SKILL_SECRET is not set: /skill accepts any caller (local dev only)");
const MAX_BODY = 64 * 1024;

// OpenCode Zen의 Jev(System One) 엔드포인트. 무료 모델은 키 없이 호출되고, 유료 jev-1.13은 OPENCODE_API_KEY가 필요하다
const JEV_URL = process.env.JEV_URL ?? "https://opencode.ai/zen/v1/systemone";
const JEV_MODEL = process.env.JEV_MODEL ?? "jev-1.13-free";
const KEY = process.env.OPENCODE_API_KEY;

type Noul = { type: "noul"; noul: number };

const judge: Judge = async (secret, message) => {
  const res = await fetch(JEV_URL, {
    method: "POST",
    headers: { "content-type": "application/json", ...(KEY && { authorization: `Bearer ${KEY}` }) },
    body: JSON.stringify({
      model: JEV_MODEL,
      state: { secret, message },
      questions: {
        correct: { type: "noul", instructions: "Does the user's message name the secret word itself (or an exact synonym), as a guess?" },
        yes: { type: "noul", instructions: "This is a 20-questions game. Answer the player's yes/no question about the secret word using common sense about what the thing typically is. Is the answer 'yes'?" },
      },
    }),
    // 카카오 스킬은 5초 안에 응답해야 하므로 재시도 없이 3.5초에서 끊는다
    signal: AbortSignal.timeout(3500),
  });
  if (!res.ok) throw new Error(`jev ${res.status}: ${await res.text()}`);
  const { answers } = (await res.json()) as { answers: { correct: Noul; yes: Noul } };
  if (typeof answers?.correct?.noul !== "number" || typeof answers?.yes?.noul !== "number") throw new Error("jev: bad answer shape");
  return { correct: answers.correct.noul, yes: answers.yes.noul };
};

// ponytail: 메모리 저장, 재시작하면 게임이 사라진다. 여러 인스턴스로 늘리면 Redis로 옮긴다
const games = new Map<string, Game>();
let pruned = 0;
// 지난 날짜 게임은 쓸모가 없으니 날이 바뀌면 지운다
function prune() {
  const today = dayNumber();
  if (today === pruned) return;
  for (const [k, g] of games) if (g.day < today) games.delete(k);
  pruned = today;
}

const authorized = (header: string | string[] | undefined) =>
  !SECRET || (typeof header === "string" && header.length === SECRET.length && timingSafeEqual(Buffer.from(header), Buffer.from(SECRET)));

const kakao = (text: string, buttons: string[]) => ({
  version: "2.0",
  template: {
    // 그룹방에서는 quickReplies가 렌더링되지 않아 카드 버튼을 쓴다
    outputs: [{ textCard: { description: text, buttons: buttons.map((label) => ({ label, action: "message", messageText: label })) } }],
  },
});

createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/skill") return res.writeHead(404).end();
  if (!authorized(req.headers["x-skill-secret"])) return res.writeHead(401).end();
  if (Number(req.headers["content-length"] ?? 0) > MAX_BODY) return res.writeHead(413).end();
  let body;
  try {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > MAX_BODY) return res.writeHead(413).end(() => req.destroy());
    }
    body = JSON.parse(raw);
  } catch {
    return res.writeHead(400).end();
  }
  const user = body?.userRequest;
  // 그룹방은 방 하나에 게임 하나, 1:1은 사용자마다 게임 하나
  const key = user?.chat?.properties?.botGroupKey ?? user?.user?.id;
  if (typeof key !== "string" || key.length > 256 || typeof user?.utterance !== "string" || user.utterance.length > 1000)
    return res.writeHead(400).end();

  prune();
  const reply = await handle(games.get(key), user.utterance, judge);
  if (reply.game) games.set(key, reply.game);
  res.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(kakao(reply.text, reply.buttons)));
}).listen(Number(process.env.PORT ?? 8080));
