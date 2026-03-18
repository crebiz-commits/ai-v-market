---
description: Bunny.net & Supabase Video Integration Pipeline
---

이 워크플로우는 새로운 비디오 스트리밍 기능을 추가하거나 기존 연동을 복구할 때 사용합니다.

### 1단계: Bunny.net 보안 설정 확인 (수동)
- [ ] Bunny.net Stream Library에서 CORS: ON, Token Auth: OFF, Allowed Referrers: * 설정을 확인합니다.

### 2단계: Supabase 환경 변수 설정
// turbo
1. 다음 명령어를 실행하여 필수 환경 변수를 설정합니다:
```bash
supabase secrets set BUNNY_API_KEY=YOUR_KEY
supabase secrets set BUNNY_LIBRARY_ID=YOUR_ID
supabase secrets set BUNNY_HOSTNAME=YOUR_HOSTNAME
```

### 3단계: SQL 마이그레이션 적용
1. `videos` 테이블과 RLS 정책이 없는 경우 다음 SQL을 실행합니다:
```sql
CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  video_url TEXT NOT NULL,
  thumbnail TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert their own videos" ON videos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Anyone can view videos" ON videos FOR SELECT USING (true);
```

### 4단계: 프론트엔드 연동 코드 적용
1. `src/app/components/Upload.tsx` 또는 관련 컴포넌트에서 `reusable_integration_logic.md`의 코드 패턴을 복사하여 적용합니다.
2. `import.meta.env.VITE_BUNNY_HOSTNAME`이 올바르게 설정되었는지 확인합니다.

### 5단계: 최종 검증
1. 스마트폰과 동일 Wi-Fi 환경에서 `http://[IP]:5173` 접속 후 업로드 및 재생을 테스트합니다.
