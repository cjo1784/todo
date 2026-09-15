# 05-qa-report — GitHub OAuth 로그인 + P0 회귀

- 작성: QA(T06) / 2026-09-15 / 브랜치 `feat/github-oauth`, 기준 `4cd011c`
- 대상: `git diff 4cd011c` + 새 파일 (`lib/auth.ts`, `models/User.ts`, `models/Session.ts`, `proxy.ts`, `app/auth/**`, `app/api/me`, `app/login`, `scripts/migrate-add-user-id.ts`, `components/Header.tsx`, `lib/client.ts`)
- 이력
  - 1차: 조건부 통과. dev 서버가 이전 스키마를 캐시해 E2E 차단(D1)
  - 2차: 서버 재시작 후 E2E 6/6
  - 최종(이 문서): D2·D5 수정과 리뷰어 Low 3건 보강 반영 후 재검증

## 최종 판정: **통과**

- **완료 조건:** 7개 모두 코드·Vitest·E2E로 충족한다.
- **금지사항:** 기존 CRUD 로직 변경과 시크릿 하드코딩이 없다.
- **결함:** 심각도 높음은 남아 있지 않다.
  - 해결: D1(서버 재시작), D2, D5, D4(보강으로 해결)
  - 종결: D3(계약 확정)
  - 남음: D6(낮음, 이번 범위 제외)
- **최종 실행:** tsc 0, lint 0, Vitest 43/43, Playwright 7/7. 사용자 실제 데이터 건수는 실행 전후 같고, E2E 데이터는 0건이다.
- **사용자 확인 대기:** 실제 GitHub 로그아웃 후 세션 삭제는 사용자 확인이 필요하다(아래 미검증 영역). 같은 코드 경로는 E2E (d)로 검증했으므로 판정을 막지 않는다.

## 완료 조건 7개

| # | 조건 | 판정 | 근거 |
| --- | --- | --- | --- |
| 1 | OAuth App 가이드 또는 .env.example | 충족 | `.env.example` 키 3개, `docs/AUTH_SETUP.md`(App 생성, callback URL, 재시작, 스키마 변경 후 재시작, E2E 실DB 경고, 배포 Host 경고, 마이그레이션, 에러 코드). `.env.example` 값 정리는 오케스트레이터 담당(QA는 `.env*`를 읽지 않음) |
| 2 | `/auth/github`, `/auth/github/callback` 동작 | 충족 | `app/auth/github/route.ts`: authorize 302, `scope=read:user`, state 쿠키(32바이트). `callback/route.ts`: state 비교, 토큰 교환, upsert, 이전 세션 삭제, 세션 발급, GitHub fetch 10초 타임아웃. Vitest(fetch 모의)로 정상·거부·state 불일치·토큰 실패·`/user` 5xx/HTML/id 누락·`avatar_url` 누락·타임아웃 확인. 실제 GitHub 로그인 성공(users 1·sessions 1 생성, 건수만 확인) |
| 3 | username, avatar_url DB 저장 | 충족 | `callback/route.ts:66-70` upsert `{githubId}` → `username`, `avatarUrl`. `avatar_url`이 문자열이 아니면 저장하지 않고 `error=oauth`. access token 미저장 |
| 4 | 미로그인 → 401 또는 리다이렉트 | 충족 | `lib/api.ts` `handle` → `requireUser`: 모든 `/api/**` 16개 핸들러가 쿠키 없음·위조 모두 401. `proxy.ts`: 화면은 `/login`으로 307. E2E (a) `/` → `/login`, API 401. 위조 쿠키면 API 401 → `/login`에 머묾(무한 리다이렉트 없음) |
| 5 | 본인 할 일만 조회/수정/삭제 | 충족 | 소유자 조건: `findOr404` `{_id, userId}`, `assertRef`, 목록 필터, 진행률 집계(D2). Vitest: 남의 항목 GET/PATCH/DELETE 404, 남의 상위 항목 연결 400, `?weeklyPlanId=`·`?date=` 격리, body `userId` 무시, 남의 할 일이 진행률에 포함 안 됨. E2E (e): B 세션에서 A 데이터 미노출, id 직접 접근 GET/PATCH/DELETE 404 |
| 6 | 로그아웃 시 세션 완전 삭제 | 충족(계약: 현재 기기 세션) | `app/auth/logout/route.ts`: POST만, 다른 Origin 403(쿠키·세션 변경 없음), 그 외 세션 문서 삭제 + 쿠키 `Max-Age=0` + 303 `/login`. E2E (d): 헤더 로그아웃 → `/login`, 쿠키 제거, 세션 문서 0건, 이전 토큰 401. dev 서버 curl(쿠키 없음): `Origin: https://evil.example` → 403, Set-Cookie 없음 / `Origin: http://localhost:3000` → 303 + `session=; Max-Age=0` |
| 7 | user_id 추가 및 마이그레이션 | 충족 | 3개 모델 `userId` required + index, 응답에서 `userId` 제거. `scripts/migrate-add-user-id.ts`: `{userId: null}` 대상, 멱등, dry-run은 쓰기·인덱스 없음, 없는 사용자·username 중복은 에러(쓰기 없음), `userId_1` 생성(Vitest) |

## 금지사항 검토

- **기존 CRUD 로직 변경: 없음.** `git diff 4cd011c -- app/api lib models tests`를 줄 단위로 확인했다.
  - 달라진 것
    - 소유자 조건(`findOr404`/`assertRef`/목록 필터/생성 시 `userId`/연결 해제 조건)
    - `withProgress` 그룹 키에 할 일 소유자 추가(D2). `calcProgress` 호출은 그대로다
    - `handle` 세 번째 인자 `user`
    - 응답에서 `userId` 제거(`toJSON`)
  - 그대로인 것: 검증 규칙, 상태 코드, 응답 형태, 필터, 연결 해제 동작
  - `tests/api.test.ts`는 인증 헤더와 호출 인자만 바뀌었고 assertion 변경은 없다.
- **CLIENT_SECRET 하드코딩: 없음(코드·테스트·docs·artifacts 기준).**
  - 코드는 `process.env` 참조만 한다. `docs/AUTH_SETUP.md`에는 `<Client secret>` 자리표시자, 테스트에는 더미 값만 있다.
  - `.env.example`에 실제 값이 들어갔던 건은 team-lead가 발견해 오케스트레이터가 정리했다. QA는 `.env*`를 읽거나 수정하지 않았다.
  - QA 파일에서 `mongodb://`, `mongodb+srv://`, `gho_` 패턴 0건이다. `playwright.config.ts`는 `.env.local`만 불러온다.

## 결함 목록 (심각도순)

### D1 [높음·환경] dev 서버가 이전 Mongoose 스키마를 캐시해 userId 없이 저장 — **해결**
- `models/*.ts`의 `mongoose.models.X ?? mongoose.model(...)` + HMR
- **재현(1차)**: 목표 추가 → `POST /api/year-goals` 201 → `GET` `[]`. Atlas에 `userId` 없는 문서 2건(QA 데이터, 삭제함).
- **조치**: dev 서버 재시작, `docs/AUTH_SETUP.md`에 "`models/*` 스키마 변경 후 재시작" 추가.
- **확인**: D2로 모델 파일이 바뀐 뒤에도 E2E 생성·조회가 정상이었다. 실행 전후 `userId` 없는 문서 0건.

### D2 [중간] 진행률 집계가 할 일 소유자를 확인하지 않음 — **해결**
- `models/WeeklyPlan.ts:29-49` `withProgress`
- **재현(수정 전)**: B 소유 할 일의 `weeklyPlanId`가 A의 계획인 문서를 DB에 직접 넣으면 A의 계획이 `todoCount:1, doneCount:1, progress:100`으로 집계됨.
- **수정 리뷰**: `{plan, user}`로 묶고 `${plan}:${계획 소유자}` 쌍만 사용한다. 계산식은 그대로다. `userId`가 없는 옛 문서끼리는 `undefined` 키로 서로 맞물리는데, 마이그레이션 전 상태라 무해하다.
- **실행**: `tests/auth.test.ts` "진행률 집계 소유자 조건 (QA D2)" 통과. B의 미완료 할 일 3개를 붙여도 A는 `1/1, 100`. 수정 전 코드라면 `todoCount 4`로 실패하는 테스트다.

### D3 [중간·요구 해석] 로그아웃이 현재 기기 세션만 삭제 — **종결(계약 확정)**
- `00-input.md` 결정표 "로그아웃 범위: 현재 기기 세션만 삭제 (사용자 선택)"와 구현이 일치한다.

### D4 [낮음] GitHub `/user` 응답에 `avatar_url`이 없으면 `avatarUrl` 없는 사용자 생성 — **해결(보강)**
- `app/auth/github/callback/route.ts:41-43`: `typeof gh.avatar_url === "string"`이 아니면 `null` → `/login?error=oauth`. backend-auth 테스트가 추가됐고 Vitest 통과.

### D5 [낮음] `/api/me`가 401 외 이유로 실패하면 로그아웃 버튼이 사라짐 — **해결**
- `components/Header.tsx:30-38, 93-111`
- **수정 리뷰**
  - 401 → `null`: 사용자 영역과 로그아웃 모두 숨김
  - 그 외 비정상 응답 → `"error"`: 로그아웃 폼만 표시
  - JSON 파싱 실패와 네트워크 오류는 rejection → `"error"`
  - 요청 취소 시에는 상태를 바꾸지 않음
- **실행**: E2E (D5)
  - `/api/me`를 500으로 흉내 내면 로그아웃 버튼이 보이고 사용자 이름은 없음
  - 401로 흉내 내면 로그아웃 버튼이 없음
  - 통과

### D6 [낮음] 401 → `/login` 이동 직전 오류 문구가 잠깐 보임 — 이번 범위 제외
- `lib/client.ts:59`: `location.assign` 뒤에도 `ApiError`가 throw된다. 무한 루프는 없다(E2E 확인).

### 리뷰어 Low 보강 3건 재검증
| 항목 | 코드 리뷰 | 실행 근거 | 판정 |
| --- | --- | --- | --- |
| 로그아웃 다른 Origin → 403 | `logout/route.ts:8-11`: `Origin`이 있고 `APP_URL`(없으면 `req.url`) origin과 다르면 DB 연결·세션 삭제·쿠키 설정 전에 403 `FORBIDDEN`. Origin이 없으면 기존 흐름(SameSite=Lax가 방어) | curl(쿠키 없음): 다른 Origin 403, Set-Cookie 없음 / 같은 Origin 303 + 쿠키 만료. E2E (d): 브라우저 폼 로그아웃(같은 출처 Origin) 303 `/login` 통과. backend-auth Vitest 통과 | 통과 |
| 재로그인 시 이전 세션 삭제 | `callback/route.ts:71`: upsert 뒤 `deleteSession(req)` → `createSession`. 다른 계정으로 재로그인해도 이전 쿠키의 세션 문서가 지워진다. 실패하면 catch → `error=oauth` | Vitest 43/43. QA의 "심어 둔 토큰 재사용 안 함" 테스트 포함 | 통과 |
| `avatar_url` 검사 + GitHub fetch 10초 타임아웃 | `callback/route.ts:15, 31, 38, 41-43`: 두 fetch에 `AbortSignal.timeout(10_000)`. 타임아웃 예외는 try/catch → `error=oauth`. 신호는 본문 읽기(`json()`)에도 적용됨 | Vitest 통과(backend-auth 추가 테스트) | 통과 |

- 참고(결함 아님, 문서화 대상): `APP_URL`과 다른 호스트(예: `127.0.0.1:3000`)로 접속하면 브라우저 Origin이 달라 로그아웃이 403이 된다. 오케스트레이터가 문서화 대상으로 기록했다.

### 참고(결함 아님)
- **키보드 드래그 연타**: 방향키를 간격 없이 두 번 누르면 한 칸만 이동한다. 사람 속도 입력에서는 정상이다.
- **동시 첫 로그인**: 같은 계정이 동시에 3건 들어와도 사용자 1건.
- **Host 헤더**: 조작해도 dev 서버는 `localhost:3000`으로 리다이렉트한다. 리버스 프록시 뒤 production은 AUTH_SETUP에 경고됨.
- **state**: 32바이트 난수, httpOnly·lax·10분, `timingSafeEqual`, 콜백에서 항상 삭제.
- **secure 쿠키**: `NODE_ENV=production`에서만 붙는다(의도, 문서화됨).

## 추가한 테스트와 실행 결과

### 추가·변경 파일 (앱 코드 수정 없음)
- `tests/auth-edge.test.ts` (Vitest 11개)
  - body `userId` 주입 무시, `?date=` 격리
  - 쿠키 해석(`xsession=`·빈 값·변조·다른 쿠키 사이), 사용자 삭제 후 세션 401
  - 로그아웃 GET 미제공, 세션 고정 방지
  - GitHub `/user` 5xx·HTML·id 누락·id 문자열, 토큰 503 → oauth
  - 리다이렉트 파라미터 주입 무시, 동시 첫 로그인 1건
  - 마이그레이션 dry-run 인덱스 미생성, username 중복 에러 시 쓰기 없음
- `playwright.config.ts`: `testDir: e2e`, 실행 중인 `http://localhost:3000` 대상, webServer 없음, `process.loadEnvFile(".env.local")`
- `e2e/db.ts`, `e2e/global-setup.ts`
  - `[e2e-check]` 사용자와 세션 생성(`lib/auth.ts` `createSession` 재사용)
  - 시작 전과 종료 시(실패해도) 정리하고, 0건이 아니면 실패
  - **정리 범위**: username `^\[e2e-check\]` 사용자, 그 `userId`의 세션, 그 사용자 소유이거나 title이 `^\[e2e-check\]`인 할 일·계획·목표만. 태그 없는 실제 사용자 데이터는 대상이 아니다.
- `e2e/auth-p0.spec.ts` (7개)
  - (a) 미로그인 `/`→`/login`, API 401
  - `/login?error=state` 문구 + 위조 쿠키 → `/login` 유지
  - (b) 목표 → 주간 계획 연결 → 할 일 2개 생성·연결 → 키보드 드래그로 완료 → 진행률 0→50, 새로고침 후 유지
  - (c) 포인터 드래그로 진행 중 + PATCH 500 모의 → 원위치·오류 문구·서버 상태 불변
  - (e) B 세션에서 A 데이터 미노출, id 직접 접근 404
  - (D5) `/api/me` 500 → 로그아웃 유지 / 401 → 사용자 영역 없음
  - (d) 헤더 두 테마 → 로그아웃 → `/login`, 쿠키 제거, 세션 문서 0건, 이전 토큰 401
- `package.json`: `@playwright/test` devDependency 추가(chromium headless shell 설치)
- Vitest는 `tests/**/*.test.ts`만 포함하므로 e2e 파일을 실행하지 않는다.

### 최종 실행 결과 (보강 반영 후, 재시작된 dev 서버)
| 명령 | 결과 |
| --- | --- |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` (`eslint`) | 오류 0, 경고 0 |
| `npx vitest run` | 4 files, **43 passed / 0 failed** (기존 28 + QA 11 + backend-auth D2·보강 4) |
| `npx playwright test` | **7 passed / 0 failed / skip 0**. 정리 결과 `{"users":0,"sessions":0,"todos":0,"weeklyPlans":0,"yearGoals":0}` |
| `npm run build` | QA 미실행(team-lead가 이후 실행 예정) |

### 실제 DB 건수 (Atlas `todo`, 건수만 조회)
| 시점 | users | sessions | todos | weeklyplans | yeargoals | e2e 데이터 | userId 없는 문서 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 최종 E2E 전 | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| 최종 E2E 후 | 1 | 1 | 0 | 0 | 0 | 0 | 0 |

사용자 본인 실제 계정(users 1·sessions 1)은 그대로이고, E2E 데이터는 0건이다.

## 미검증 영역
- **실제 GitHub OAuth 왕복**: 로그인 성공은 확인했다(사용자 본인 계정으로 users 1·sessions 1 생성, 건수만 확인). 로그아웃 후 세션 삭제는 사용자 확인 대기다. 같은 코드 경로는 E2E (d)에서 테스트 사용자로 검증했다.
- 마이그레이션 스크립트 CLI 실제 실행(함수 단위만 검증)
- `npm run build`와 production 모드(`secure` 쿠키, 프록시 뒤 Host 처리)
- 모바일 뷰포트, 실제 스크린 리더
