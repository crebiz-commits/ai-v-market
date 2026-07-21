-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 점검 (read-only) — RETURNS TABLE ↔ 무별칭 컬럼 참조 충돌 (2026-07-21 신설)
--
--   ▣ 재사용 가능한 상시 점검. plpgsql 함수를 새로 만들거나 고친 뒤 Run 할 것.
--   ▣ 기대값: '의심 함수 수' = 0.  (2026-07-21 기준 0 확인 — 아래 이력 참조)
--
--   [무엇을 잡나] admin_grant_premium 에서 실제로 터진 유형:
--     RETURNS TABLE(...) 의 컬럼명은 함수 본문 전체에서 OUT 파라미터(변수)로 살아 있다.
--     본문에서 같은 이름의 테이블 컬럼을 별칭 없이 쓰면
--         WHERE lower(email) = ...      ← auth.users.email? OUT 파라미터 email?
--     plpgsql 기본 variable_conflict=error → **호출 즉시 런타임 예외**.
--     정의만 보는 검증(prosrc ~ '...')으로는 절대 안 잡히고, 눌러봐야 드러난다.
--
--   [안전한 경우 — 오탐이므로 제외한다]
--     ① 본문에 `#variable_conflict use_column` 선언  ← ★ 가장 중요
--        이 pragma 가 있으면 기본값(error)이 꺼지고 이름 충돌 시 컬럼으로 해석 → 예외 없음.
--        (`use_variable` 도 마찬가지로 예외를 없앤다)
--     ② 출력 별칭 `... AS new_users` — 결과 컬럼 이름을 붙이는 것이라 참조가 아님
--     ③ `이름 :=` 대입 / `INTO 이름` / `SET 이름 =`(UPDATE 좌변)
--     ④ `ON CONFLICT (col, ...)` — 인덱스 지정
--     ⑤ 별칭 붙은 참조(`u.email`)
--
--   [이력]
--     · 2026-07-21 1차: 529컬럼 중 14함수 → 별칭 오탐 다수
--     · 2026-07-21 2차: 별칭 제거 후 3함수(get_daily_user_growth / get_playlist_videos /
--       get_recommended_videos) → **셋 다 `#variable_conflict use_column` 보유 = 안전**
--     · 결론: 이 유형의 실제 결함은 admin_grant_premium 하나뿐이었고
--       admin_grant_premium_ambiguous_fix_20260721.sql 로 수정 완료.
--     · 참고: phase13_fix_recommended_ambiguous.sql 이 과거 같은 유형을 고친 이력
--       (그 수정이 바로 이 pragma 추가였고 이후 재정의에서도 보존됨)
--
--   사용: Supabase Dashboard → SQL Editor → 전체 붙여넣기 → Run.
--         read-only — 아무것도 변경하지 않음.
--   ▶ `― 요약 ―` 행은 항상 나온다(0행과 "쿼리 안 돎" 구분용).
--   ▶ 의심 함수가 나오면 **정적 판단으로 끝내지 말고 실제로 호출해 확인할 것.**
-- ════════════════════════════════════════════════════════════════════════════

WITH tbl_out AS (
  SELECT
    p.oid::regprocedure::text AS signature,
    p.prosrc,
    x.nm AS out_col
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL unnest(p.proargnames, p.proargmodes) AS x(nm, md)
  WHERE n.nspname = 'public'
    AND p.prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql')
    AND p.proargmodes IS NOT NULL
    AND x.md = 't'
    AND x.nm IS NOT NULL
    -- ★ #variable_conflict 선언이 있으면 이름 충돌이 예외가 되지 않는다 → 검사 대상 제외
    AND p.prosrc !~* '#variable_conflict[[:space:]]+use_(column|variable)'
),
hits AS (
  SELECT t.signature, t.out_col, l.lineno, btrim(l.raw) AS src_line
  FROM tbl_out t
  CROSS JOIN LATERAL unnest(string_to_array(t.prosrc, E'\n')) WITH ORDINALITY AS l(raw, lineno)
  CROSS JOIN LATERAL (
    SELECT
      -- ① 주석 제거 → ② 문자열 리터럴 제거 → ③ 출력 별칭 `AS <컬럼명>` 제거
      regexp_replace(
        regexp_replace(
          regexp_replace(l.raw, '--.*$', ''),
          '''[^'']*''', '', 'g'
        ),
        'AS[[:space:]]+"?' || t.out_col || '"?\M', '', 'gi'
      ) AS code
  ) c
  WHERE
    c.code ~ ('(^|[^.[:alnum:]_])' || t.out_col || '\M')
    AND c.code !~  (t.out_col || '[[:space:]]*:=')
    AND c.code !~* ('into[[:space:]]+' || t.out_col)
    AND c.code !~* ('set[[:space:]]+'  || t.out_col || '[[:space:]]*=')
    AND c.code !~* 'on[[:space:]]+conflict'
    AND c.code ~* '(where|join|[[:space:]]on[[:space:]]|select|from|[[:space:]]and[[:space:]]|[[:space:]]or[[:space:]])'
)
SELECT
  '― 요약 ―'                                            AS signature,
  (SELECT count(*)::text FROM tbl_out)                   AS out_col,
  (SELECT count(DISTINCT signature)::text FROM hits)     AS lineno,
  '검사대상 컬럼수(pragma 보유 함수 제외) / 의심 함수 수 — 0이면 PASS' AS src_line

UNION ALL

SELECT h.signature, h.out_col, h.lineno::text, h.src_line
FROM hits h

ORDER BY 1, 3;
