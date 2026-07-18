-- 정산 엔진 2종 중 어느 것이 무가드인지 진단 (read-only)
SELECT proname,
       (prosrc ~ 'assert_admin') AS has_assert_admin,
       pg_get_function_identity_arguments(oid) AS args
FROM pg_proc
WHERE proname IN ('calculate_monthly_revenue','mark_revenue_paid')
ORDER BY proname;
