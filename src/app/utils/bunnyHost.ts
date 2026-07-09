// Bunny Stream CDN pull-zone 호스트 (SSOT).
//   정본은 VITE_BUNNY_HOSTNAME env. 폴백을 `vz-${libraryId}.b-cdn.net` 로 만들면
//   틀린 호스트라 재생·썸네일이 전부 깨진다(라이브러리 숫자 ID ≠ pull-zone GUID 호스트).
//   → env 미설정 시에도 안전하도록 실제 pull-zone GUID 호스트를 폴백으로 고정.
//   (라이브러리 creaite_market/615810 의 pull-zone: vz-6e85411f-96a.b-cdn.net)
export const BUNNY_HOST: string =
  ((import.meta as any).env?.VITE_BUNNY_HOSTNAME as string) || "vz-6e85411f-96a.b-cdn.net";
