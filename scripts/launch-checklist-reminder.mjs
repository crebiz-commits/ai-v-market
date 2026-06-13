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

let section = '';
for (const l of lines) {
  const s = l.trim();
  if (s.startsWith('## ')) section = s.replace(/^##\s*/, '');
  if (s.includes('- [ ]')) {
    const item = s.replace(/^- \[ \]\s*/, '').replace(/\s*\[[^\]]*\]\([^)]*\)/g, ''); // 링크 제거해 간결화
    out.push(`• [${section}] ${item}`);
  }
}

console.log(out.join('\n'));
