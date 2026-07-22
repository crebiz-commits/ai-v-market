#!/usr/bin/env node
// 세션 시작 훅 전용 — 출시 체크리스트(docs/launch-checklist.md)의 미완료 항목을 요약 출력.
// stdout 이 Claude 세션 컨텍스트에 주입되어, 매 세션 시작 시 남은 할 일을 자동으로 인지/보고하게 함.
// 완료되면(미완료 0건) 축하 메시지. 파일 없으면 조용히 종료.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const mdPath = resolve(here, '..', 'docs', 'launch-checklist.md');

let text;
try {
  text = readFileSync(mdPath, 'utf8');
} catch {
  process.exit(0); // 체크리스트 없으면 아무것도 안 함
}

const lines = text.split(/\r?\n/);
const open = lines.filter((l) => l.includes('- [ ]')).map((l) => l.trim());
const done = lines.filter((l) => /- \[x\]/i.test(l)).length;

if (open.length === 0) {
  console.log('🎉 출시 체크리스트 전 항목 완료! (docs/launch-checklist.md)');
  process.exit(0);
}

// 섹션 헤더(## …)와 함께 보여주면 맥락이 잡힘
const out = [];
out.push(`🚀 CREAITE 출시 체크리스트 — 미완료 ${open.length}건 / 완료 ${done}건`);
out.push('(아래는 docs/launch-checklist.md 의 미체크 항목. 사용자가 묻지 않아도 이어서 무엇을 할지 먼저 안내할 것.)');
out.push('');

// 항목 수집 (섹션 맥락 유지)
const items = [];
let section = '';
for (const l of lines) {
  const s = l.trim();
  if (s.startsWith('## ')) section = s.replace(/^##\s*/, '');
  if (s.includes('- [ ]')) {
    const item = s.replace(/^- \[ \]\s*/, '').replace(/\s*\[[^\]]*\]\([^)]*\)/g, ''); // 링크 제거해 간결화
    items.push({ section, item });
  }
}

// ⏰ 마감일 항목은 맨 위로 끌어올린다 — 30개 넘는 목록 중간에 묻히면 리마인더 구실을 못 한다.
//   판정: ⏰ 마커 + YYYY-MM-DD 날짜. 남은 일수를 계산해 임박한 순으로 정렬하고, 지난 건 먼저 띄운다.
const DATE_RE = /(20\d{2})-(\d{2})-(\d{2})/;
const today = new Date();
today.setHours(0, 0, 0, 0);
const dday = (d) => Math.round((d - today) / 86400000);

const deadlines = [];
const rest = [];
for (const it of items) {
  const m = it.item.includes('⏰') ? it.item.match(DATE_RE) : null;
  if (m) {
    const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    deadlines.push({ ...it, due, days: dday(due) });
  } else {
    rest.push(it);
  }
}

if (deadlines.length > 0) {
  deadlines.sort((a, b) => a.due - b.due);
  out.push('⏰ 마감일 있는 항목 — 날짜를 먼저 확인하고 안내할 것');
  for (const d of deadlines) {
    const tag = d.days < 0 ? `🔴 ${-d.days}일 지남` : d.days === 0 ? '🔴 오늘' : `D-${d.days}`;
    out.push(`• [${tag}] ${d.item}`);
  }
  out.push('');
}

for (const it of rest) out.push(`• [${it.section}] ${it.item}`);

console.log(out.join('\n'));
