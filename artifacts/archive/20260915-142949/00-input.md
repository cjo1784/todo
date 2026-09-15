# 00-input — GitHub OAuth 로그인

- 이전 실행(P0 + UI 테마) 산출물: `artifacts/archive/20260915-121722/`
- 기준 커밋: `4cd011c` (main, cjo1784/todo 푸시 완료) / 작업 브랜치: `feat/github-oauth`

## 요청 완료 조건 (사용자 원문)
- [ ] GitHub OAuth App 설정 가이드 또는 .env.example 제공
- [ ] /auth/github, /auth/github/callback 라우트 동작
- [ ] 로그인 후 GitHub username, avatar_url을 DB에 저장
- [ ] 로그인하지 않은 사용자는 할 일 목록에 접근 불가 (401 또는 리다이렉트)
- [ ] 로그인한 사용자는 본인의 할 일만 조회/수정/삭제 가능
- [ ] 로그아웃 시 세션 완전 삭제
- [ ] 기존 할 일 데이터 스키마에 user_id 컬럼 추가 및 마이그레이션

## 금지
- 기존 할 일 CRUD 로직 변경 금지
- 하드코딩된 CLIENT_SECRET 금지
- 미완성 상태로 "완료" 보고 금지

## 결정
| 항목 | 결정 | 근거 |
| --- | --- | --- |
| 격리 범위 | 할 일 + 주간 계획 + 1년 목표 | 사용자 선택 |
| OAuth 구현 | 직접 구현 (fetch), 새 의존성 없음 | 요구 경로(`/auth/github`)가 Auth.js 기본 경로와 다름, 흐름이 짧음 |
| 세션 | MongoDB `sessions` 컬렉션 + httpOnly 쿠키, 토큰은 sha256 해시만 저장, TTL 인덱스 | "로그아웃 시 세션 완전 삭제"를 서버에서 보장 |
| GitHub access token | 저장하지 않음 | 로그인 후 쓸 곳 없음 |
| 필드 이름 | `userId`, `username`, `avatarUrl` (camelCase) | 기존 `weeklyPlanId` 규칙. 요구의 `user_id`/`avatar_url`에 대응 |
| 미로그인 | API → 401 JSON, 화면 → `/login` 리다이렉트 (Next 16 `proxy.ts`) | 둘 다 충족 |
| 타인 항목 접근 | 404 `NOT_FOUND` (존재 여부 노출 안 함), 타인 상위 항목 연결 → 400 `INVALID_REFERENCE` | 기존 에러 계약 재사용 |
| 마이그레이션 | `userId` 없는 문서를 지정한 GitHub 사용자에게 할당하는 멱등 스크립트 + 인덱스 | MongoDB는 스키마리스 → "컬럼" = 필드 + 스키마 required + 인덱스 |
| 로그아웃 범위 | 현재 기기 세션만 삭제 (세션 문서 + 쿠키) | 사용자 선택 (QA D3, 2026-09-15) |
| 푸시 | 완료(리뷰어 승인·회귀 통과) 후 푸시 | 사용자 요청 "완료되면 푸쉬해줘" |
| DB 현황 | Atlas `todo` DB 3컬렉션 모두 0건 (2026-09-15 확인) | |

## 계약 (Backend·Frontend 공통)
- 환경 변수: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `APP_URL`(예: `http://localhost:3000`), 기존 `MONGODB_URI`
- `GET /auth/github` → 302 GitHub authorize (`scope=read:user`, `state` 쿠키)
- `GET /auth/github/callback` → 성공 302 `/`, 실패 302 `/login?error=state|oauth|config|denied`
- `POST /auth/logout` → 세션 문서 삭제 + `session` 쿠키 만료 → 303 `/login`
- `GET /api/me` → 200 `{ id, username, avatarUrl }` / 401
- 모든 `/api/**` 미로그인 → 401 `{ error: { code: "UNAUTHORIZED", message, details: null } }`
- 기존 API 응답 형태 불변 (`userId`는 응답에 노출하지 않음)

## 파일 담당
- Backend: `models/User.ts`, `models/Session.ts`, `models/*`(userId), `lib/auth.ts`, `lib/api.ts`, `app/api/**`, `app/auth/**`, `proxy.ts`, `scripts/`, `tests/`, `.env.example`, `docs/AUTH_SETUP.md`
- Frontend: `app/login/**`, `components/Header.tsx`, `lib/client.ts`, `next.config.ts`

## 사용자 작업 필요
- GitHub OAuth App 생성, `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`을 `.env.local`에 직접 입력 (채팅에 붙여넣지 않음)
- 실제 GitHub 로그인 확인은 이 값이 들어간 뒤에만 가능

## 승인 지점
- `feat/github-oauth` → main 머지·푸시 (QA 후)
