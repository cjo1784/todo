# 00-input

## 요청
- `docs/PRD.md` P0 구현: 백엔드(M1~M2) → 프론트엔드(M3) → QA(M4)
- 계획: `docs/PLAN.md` (승인됨, 2026-09-15)
- 규칙: `docs/CLAUDE.md`

## 제약
- Next.js App Router + TypeScript + MongoDB/Mongoose
- 로그인 없음, 단일 사용자
- dnd-kit, Tailwind, Vitest + mongodb-memory-server, Playwright
- PRD에 없는 기능 추가 금지, P0 완료 전 P1 착수 금지

## 기존 코드베이스
- 코드 없음 (신규). `docs/` 문서만 존재
- 환경: Node v25.9.0, npm 11.12.1, docker CLI 있음, mongod 없음, brew 있음

## 역할 조정
- PRD 이미 작성됨 → T02(PM) 생략, `docs/PRD.md`를 `01-prd` 입력으로 사용
- AI 연동 요구 없음 → T05 생략

## 결정
- MongoDB: Atlas (사용자 선택). 접속 문자열은 사용자가 `.env.local`에 직접 입력. 개발·테스트는 mongodb-memory-server로 진행 가능
- Atlas 연결 확인 완료 (2026-09-15): KT DNS가 SRV 조회 실패 → `mongodb+srv://`를 표준 `mongodb://호스트3개?tls=true&replicaSet=...&authSource=admin`로 변환 (사용자 승인). DB 이름 `todo`

- GitHub: `cjo1784/todo`, **Public**, 프론트엔드 완료 후 로컬 실행 확인 직후 첫 커밋·푸시 (사용자 선택, 2026-09-15). 푸시 전 비밀값 스캔 필수

- UI 리디자인: 사용자 피드백("구닥다리 느낌") → "밝고 컬러풀한 카드형" 선택 (2026-09-15). 기능·API 불변, 스타일만 변경
- 개발자 테마 추가: "터미널/IDE 다크" + 앱 안 테마 토글로 컬러풀 카드형과 전환 (사용자 선택, 2026-09-15). CSS 변수 토큰 + `data-theme`, 선택은 localStorage
- hydration 경고: HWP 확장이 `<html>`에 속성 주입 → `app/layout.tsx` `<html suppressHydrationWarning>` (오케스트레이터 수정)

## 승인 지점
- ~~MongoDB 실행 위치 결정~~ → Atlas
- 머지·배포·삭제 등 위험 행동
