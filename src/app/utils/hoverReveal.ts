// ════════════════════════════════════════════════════════════════════════════
// 호버로만 나타나는 기능 버튼 — 터치 기기 도달 불가 문제 해결 (2026-07-22)
//
//   [문제] 목록 항목의 삭제·수정 버튼을 `opacity-0 group-hover:opacity-100` 으로
//     숨겨두면, hover 가 없는 터치 기기에서는 **버튼이 영영 보이지 않는다**.
//     화면상 아무 단서가 없어 "그 기능이 없는 것"이 된다(실제로 알림 삭제·시청기록
//     삭제·보관함 순서변경/삭제 6곳이 모바일에서 사용 불가 상태였다).
//
//   [해결] 화면 폭(md:)이 아니라 **입력장치**로 판정한다.
//     · 폭 기준은 아이패드(768px 이상 + 터치)를 놓치고, 창을 좁힌 데스크톱도 오판한다.
//     · Tailwind v4 의 pointer-fine 은 `@media (pointer: fine)` = 마우스·트랙패드일 때만.
//
//   [동작]
//     · 터치 기기        → 기본 opacity-100 이므로 **항상 보임**
//     · 마우스 기기      → pointer-fine:opacity-0 으로 숨었다가 호버 시 나타남
//     · 키보드 탐색      → focus-visible 로 나타남(호버 못 하는 접근성 경로)
//
//   ※ pointer-fine 스택 변형이 group-hover 보다 선택자 특이성이 낮아
//     `pointer-fine:group-hover:opacity-100` 이 항상 이긴다(순서 의존 없음).
//
//   사용: className={`${HOVER_REVEAL} p-1.5 rounded ...`}
// ════════════════════════════════════════════════════════════════════════════

export const HOVER_REVEAL =
  "opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity";
