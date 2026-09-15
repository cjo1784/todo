# 02-backend-report — GitHub OAuth + 사용자별 데이터 격리 (T03 Backend)

기준: `artifacts/00-input.md`. 검증 일시 2026-09-15. git 명령은 사용하지 않음(커밋은 오케스트레이터).

## 0. 요약
사용자 완료 조건 7개는 모두 코드와 테스트로 충족했다. 단, **실제 GitHub 로그인은 확인하지 못했다.** OAuth App 값이 필요하다(§6). `npx tsc --noEmit` exit 0, `npm run lint` exit 0, `npx vitest run` 28/28 통과했다(기존 17개 + 새 11개).

## 1. 완료 조건별 충족 여부
| # | 사용자 완료 조건 | 충족 | 근거 (파일:줄 / 테스트) |
| --- | --- | --- | --- |
| 1 | OAuth App 설정 가이드 또는 .env.example | O | `.env.example`(GITHUB_CLIENT_ID=, GITHUB_CLIENT_SECRET=, APP_URL=http://localhost:3000), `docs/AUTH_SETUP.md`(App 생성 경로·Homepage·callback URL, `.env.local`, 재시작, 커밋 금지, 배포 시 URL 변경, 마이그레이션, 에러 코드) |
| 2 | `/auth/github`, `/auth/github/callback` 동작 | O | `app/auth/github/route.ts:4-19`, `app/auth/github/callback/route.ts:32-65` / 테스트 `GET /auth/github > 302 authorize URL + oauth_state 쿠키`, `> 환경 변수 없음 → /login?error=config`, `GET /auth/github/callback > 사용자 거부 → denied, state 불일치·없음 → state`, `> 정상 흐름 …`, `> 토큰 교환 실패 → oauth …` / dev 서버 curl `/auth/github` → 302 `/login?error=config` |
| 3 | 로그인 후 username, avatar_url DB 저장 | O | `models/User.ts`, upsert `app/auth/github/callback/route.ts:52-56` / 테스트 `정상 흐름 → User 저장 + 세션 문서 + session 쿠키 → 302 /, 재로그인은 upsert` |
| 4 | 미로그인 사용자 할 일 접근 불가 | O | API: `lib/api.ts:24-28`(`handle`에서 `requireUser`), `lib/auth.ts:48-52` → 401. 화면: `proxy.ts` → `/login` 리다이렉트 / 테스트 `미로그인 > 모든 /api/** → 401 UNAUTHORIZED (쿠키 없음·위조 쿠키)`, `> 만료된 세션 → 401` / curl `/api/todos` 401 JSON, `/` `/weekly` `/goals` → 307 `/login` |
| 5 | 본인 할 일만 조회/수정/삭제 | O | 목록 필터 `app/api/todos/route.ts:19`, `weekly-plans/route.ts:6`, `year-goals/route.ts:5` / 생성 `todos/route.ts:25`, `weekly-plans/route.ts:13`, `year-goals/route.ts:10` / `findOr404` `lib/api.ts:60-66` / `assertRef` `lib/api.ts:69-81` / 연결 해제 `weekly-plans/[id]/route.ts:24`, `year-goals/[id]/route.ts:20` / 테스트 `사용자별 데이터 격리 > 목록은 본인 것만, 남의 항목 GET/PATCH/DELETE → 404, 남의 상위 항목 연결 → 400` |
| 6 | 로그아웃 시 세션 완전 삭제 | O | `app/auth/logout/route.ts`, `lib/auth.ts:43-46` / 테스트 `POST /auth/logout > 세션 문서 삭제 + 쿠키 만료 + 303 /login, 이후 401`, `> 세션 없어도 쿠키 삭제 후 303` / curl POST → 303, `set-cookie: session=; Path=/; Max-Age=0; HttpOnly; SameSite=lax` |
| 7 | user_id 추가 + 마이그레이션 | O | `models/Todo.ts:17`, `models/WeeklyPlan.ts:16`, `models/YearGoal.ts:12`(`userId` ObjectId, ref User, required, index), `scripts/migrate-add-user-id.ts` / 테스트 `migrate-add-user-id > userId 없는 문서를 사용자에게 할당, dry-run은 변경 없음, 멱등, 없는 사용자 에러` / CLI 실행 확인(§5) |

### 오케스트레이터 지시 항목별
| 항목 | 충족 | 비고 |
| --- | --- | --- |
| 환경·가이드 | O | |
| 모델 (User, Session, userId 3개) | O | Session: `tokenHash` unique, TTL `models/Session.ts:9`. `userId`는 응답에서 뺐다: `lib/db.ts:22` |
| `lib/auth.ts` | O | 32바이트 토큰, sha256 해시, 생성/조회(만료 확인 `expiresAt > now`)/삭제, `requireUser`. 쿠키 옵션 `lib/auth.ts:14-20`. env는 요청 시점에 읽음 |
| 라우트 4개 | O | `/api/me`: `app/api/me/route.ts` |
| 데이터 격리 | O | §3 diff 요약 |
| `proxy.ts` | O | dev 서버가 인식함(curl §5). `/login`에서 `/`로 보내는 로직은 **없다**(무한 루프 방지) |
| 마이그레이션 | O | |
| 테스트 | O | 기존 assertion 변경 0. skip 원인 조사 §5-3 |
| 검증 | O | `npm run build`는 지시대로 생략 |

## 2. 계약

### 환경 변수
`MONGODB_URI`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `APP_URL`(끝에 `/` 없음). 요청 시점에 읽는다. 셋 중 하나라도 비면 `/login?error=config`로 보낸다.

### 라우트
| 요청 | 조건 | 응답 |
| --- | --- | --- |
| `GET /auth/github` | env 정상 | **302** `https://github.com/login/oauth/authorize?client_id=…&redirect_uri=${APP_URL}/auth/github/callback&scope=read%3Auser&state=…` + `Set-Cookie: oauth_state=<43자>; Path=/; Max-Age=600; HttpOnly; SameSite=lax` |
| | env 누락 | **302** `/login?error=config` |
| `GET /auth/github/callback` | `?error=` 있음(사용자 거부) | 302 `/login?error=denied` |
| | state 쿠키 없음 / 쿼리 state 없음 / 불일치(timingSafeEqual) | 302 `/login?error=state` |
| | env 누락 | 302 `/login?error=config` |
| | code 없음, 토큰 교환 실패(HTTP 오류·`{error}`), 사용자 조회 실패, 네트워크·DB 예외 | 302 `/login?error=oauth` |
| | 성공 | 302 `/` + `Set-Cookie: session=<43자>; Path=/; Max-Age=2592000; HttpOnly; SameSite=lax`(production이면 `Secure` 추가) |
| | (모든 경우) | `Set-Cookie: oauth_state=; Path=/; Max-Age=0` (state 쿠키 삭제) |
| `POST /auth/logout` | 세션 있음/없음 | 세션 문서 삭제 후 **303** `/login` + `Set-Cookie: session=; Path=/; Max-Age=0; HttpOnly; SameSite=lax` |
| `GET /api/me` | 로그인 | 200 `{ "id": "66e6…", "username": "octo", "avatarUrl": "https://avatars.githubusercontent.com/u/…" }` |
| | 미로그인·만료·위조 | 401 |
| 모든 `/api/**` | 미로그인·만료·위조 | 401 `{ "error": { "code": "UNAUTHORIZED", "message": "Login required", "details": null } }` |
| 화면 `/`, `/weekly`, `/goals` 등 | `session` 쿠키 없음 | **307** `/login` (proxy 기본값. 쿠키 있으면 통과, 실제 검증은 API) |
| `/login`, `/auth/**`, `/api/**`, `/_next/**`, 확장자가 있는 파일 | | proxy가 개입하지 않음 |

프론트 참고:
- 로그아웃은 `<form method="post" action="/auth/logout">`이면 된다. 303이라 브라우저가 GET `/login`으로 이동한다.
- 화면에서 API가 401을 받으면 `/login`으로 보내면 된다. 만료 쿠키가 남아 있어도 proxy가 `/login`을 막지 않으므로 루프가 생기지 않는다.
- 쿠키는 만료된 채로 남는다. 다음 로그인이나 로그아웃 때 덮어써진다.

### 기존 API
응답 형태·상태 코드·에러 계약은 그대로다. 달라진 점은 두 가지다.
- 로그인이 없으면 401이다.
- 남의 항목은 "없는 항목"과 똑같이 처리한다: 404 `NOT_FOUND` / 400 `INVALID_REFERENCE`.

`userId`는 응답에 나오지 않고, body로 보내도 무시된다(`readBody` 화이트리스트).

## 3. 기존 CRUD 대비 변경 요약 (소유자 조건 추가 외 변경 없음)
| 파일 | 변경 전 | 변경 후 |
| --- | --- | --- |
| `lib/api.ts` `handle` | `connectDB()` → `fn(...args)` | `connectDB()` → `requireUser(req)` → `fn(req, ctx, user)`. 에러 매핑 블록은 그대로 |
| `lib/api.ts` `findOr404` | `model.findById(id)` | `model.findOne({ _id: id, userId })` |
| `lib/api.ts` `assertRef` | `model.exists({ _id: value })` | `model.exists({ _id: value, userId })` (undefined/null 통과, 형식 검사 그대로) |
| `lib/db.ts` `toJSON` | `delete ret._id` | + `delete ret.userId` |
| `models/Todo·WeeklyPlan·YearGoal` | — | `userId` 필드 1줄씩 추가. 기존 필드·검증·인덱스·`withProgress` 그대로 |
| `todos/route.ts` GET | `Todo.find(filter)` | `Todo.find({ ...filter, userId })` (date·weeklyPlanId 검증 그대로) |
| `todos/route.ts` POST, `weekly-plans/route.ts` POST, `year-goals/route.ts` POST | `create(data)` | `create({ ...data, userId })` |
| `weekly-plans/route.ts` GET, `year-goals/route.ts` GET | `find()` | `find({ userId })` (정렬 그대로) |
| `[id]` 라우트 9개 핸들러 | `findOr404(M, ctx)` / `assertRef(M, v, f)` | 인자에 `user._id` 추가 |
| `weekly-plans/[id]` DELETE, `year-goals/[id]` DELETE | `updateMany({ weeklyPlanId })` / `updateMany({ yearGoalId })` | 필터에 `userId` 추가 |

- 핸들러 시그니처에 세 번째 인자 `user`가 추가됐다. `readBody` 키 목록, 상태 코드, `withProgress` 호출은 한 글자도 바뀌지 않았다.
- `withProgress` 집계에 `userId`를 넣지 않은 이유: 집계 대상은 이미 본인 소유 계획이다. 남의 할 일을 내 계획에 연결하는 것은 `assertRef`가 막으므로 결과는 소유 범위 안으로 한정된다.

### 테스트 파일 변경 (`tests/api.test.ts`)
assertion은 한 줄도 바꾸지 않았다. 추가·변경한 것은 다음뿐이다.
- `connectDB()`를 `beforeAll`에서 호출(`beforeEach`에서 사용자를 만들기 위함)
- `beforeEach`에서 테스트 사용자와 세션 생성
- `req()`에 `headers: auth`(session 쿠키) 추가
- 잘못된 JSON 요청에 `headers: auth` 추가
- `plans.GET()`/`goals.GET()` → `GET(req())`. 인증에 요청 객체가 필요하기 때문
- `mongo.stop()` → `mongo?.stop()`

## 4. 새 테스트 (`tests/auth.test.ts`, 11개)
1. 미로그인 > 16개 `/api/**` 핸들러 × (쿠키 없음, 위조 쿠키) → 401 본문 전체 일치
2. 미로그인 > 만료된 세션(`expiresAt` 과거, TTL 삭제 전) → 401
3. `/auth/github` → 302, authorize URL 파라미터 4개, state = 쿠키 값, 쿠키 httpOnly/lax/path/600
4. `/auth/github` env 누락 → config
5. callback 거부 → denied. state 불일치·쿠키 없음·쿼리 없음 → state. 세 경우 모두 state 쿠키 삭제, fetch 호출 0, User 0
6. callback 정상(`vi.stubGlobal("fetch")`): 토큰 요청 body(client_secret은 env 값), Bearer 헤더, User 저장, access token 미저장, 세션 1건(원문 아닌 해시), session 쿠키 옵션, `/api/me` 200. 재로그인하면 User 1건 유지(username·avatarUrl 갱신), 세션 2건
7. callback 토큰 교환 실패 `{error}` → oauth, User·세션 0, session 쿠키 없음. fetch 예외 → oauth
8. logout → 303 `/login`, 쿠키 만료, 해당 사용자 세션 0건, 이후 401, 다른 사용자 세션 유지
9. logout(세션 없음) → 303 + 쿠키 삭제
10. 격리 A/B:
    - 목록은 본인 것만. `?weeklyPlanId=`에 남의 계획을 넣으면 빈 배열
    - body의 `userId`는 무시
    - 할 일·주간 계획·목표 × GET/PATCH/DELETE → 404
    - 남의 계획·목표 연결(POST·PATCH 각각) → 400 `INVALID_REFERENCE`
    - A의 데이터·연결·todoCount 유지
11. 마이그레이션:
    - 없는 사용자 → 에러
    - dry-run 건수만 세고 변경 없음
    - 필드 없음·null 문서 할당, 다른 사용자 문서는 유지
    - 두 번째 실행 0건(멱등), 3컬렉션 `userId_1` 인덱스
    - 할당된 데이터가 API 목록에 보임

## 5. 검증 명령과 실제 결과
| 명령 | 결과 |
| --- | --- |
| `npx tsc --noEmit` | exit 0. `.next/dev/types/validator.ts`에 새 라우트 4개(`api/me`, `auth/github`, `auth/github/callback`, `auth/logout`)의 타입 검증이 포함된 상태 |
| `npm run lint` | exit 0 (경고·에러 출력 없음) |
| `npx vitest run` | exit 0, **Test Files 3 passed, Tests 28 passed** (progress 4 + api 13 + auth 11), skipped 0 |
| `grep -rn "GITHUB_CLIENT_SECRET"` (node_modules·.next·.env.local* 제외) | 코드에서는 `process.env` 참조만 있음: `app/auth/github/route.ts:5-6`, `app/auth/github/callback/route.ts:17,42-43`. 그 외는 `.env.example`(빈 값), 문서, 테스트 가짜 값 `"test-client-secret"`. **하드코딩된 실제 값 없음** |

### 5-1. dev 서버(3000, 재시작 안 함) curl
dev 서버가 `proxy.ts`와 새 라우트를 모두 재시작 없이 인식했다.

| 요청 | 결과 |
| --- | --- |
| `GET /api/todos` | `401`, `content-type: application/json`, `{"error":{"code":"UNAUTHORIZED","message":"Login required","details":null}}` |
| `GET /api/me` | 401 (같은 본문) |
| `GET /`, `/weekly`, `/goals` (쿠키 없음) | `307 → http://localhost:3000/login` |
| `GET /` (`cookie: session=x`) | 200 (proxy 통과, 낙관적 검사) |
| `GET /login` | 200 (리다이렉트 없음) |
| `GET /favicon.ico` | 200 (proxy 제외) |
| `GET /auth/github` | `302 → http://localhost:3000/login?error=config` (dev 서버에 GITHUB 환경 변수 미설정) |
| `POST /auth/logout` (쿠키 없음) | `303`, `location: http://localhost:3000/login`, `set-cookie: session=; Path=/; Max-Age=0; HttpOnly; SameSite=lax` |

### 5-2. 마이그레이션 CLI (Node v25.9.0 네이티브 TS)
| 명령 | 결과 |
| --- | --- |
| `node scripts/migrate-add-user-id.ts` | Usage + `MONGODB_URI is not set`, exit 1 |
| `node --env-file=.env.local scripts/migrate-add-user-id.ts --user __e2e_nobody__ --dry-run` | Atlas 접속 성공. `User "__e2e_nobody__" not found. Log in with GitHub once, then run again.`, exit 1. **읽기만 수행**(dry-run + 없는 사용자라 쓰기 없음). 정리할 `[e2e-check]` 데이터 없음 |

- package.json에 `"type"`이 없어서 Node가 `MODULE_TYPELESS_PACKAGE_JSON` 경고를 낸다. 동작에는 영향이 없고 `docs/AUTH_SETUP.md`에 적어 두었다. `"type": "module"` 추가는 기존 설정 파일에 영향을 줄 수 있어 하지 않았다.
- 실제 할당 실행은 Atlas에 사용자가 없어서(로그인 전) 하지 않았다. 할당 로직은 테스트 11번으로 검증했다.

### 5-3. "API 테스트 13개 skipped" 조사
- **재현**: `MONGOMS_SYSTEM_BINARY=/nonexistent/mongod npx vitest run tests/api.test.ts`로 mongod 기동 실패를 강제했다.
  - 조치 전 결과: `FAIL tests/api.test.ts`, `Error: No Binary at path …`, 추가로 `TypeError: Cannot read properties of undefined (reading 'stop')`
  - 요약: `Test Files 1 failed`, `Tests 13 skipped`, **exit 1**
- **원인**: Vitest는 `beforeAll`이 실패하면 그 파일의 테스트를 "skipped"로 세고 파일은 FAIL 처리한다. 즉 조용한 skip이 아니라 실패였다. 다만 요약줄에 "13 skipped"가 보여서 skip처럼 읽힌 것으로 판단한다.
  - 당시 기동 실패의 직접 원인은 로그가 없어 확정할 수 없다. 첫 실행 시 mongod 바이너리 다운로드·압축 해제 지연이나 동시 기동이 유력하다. 재실행에서 통과한 것과도 맞는다.
- **조치**: `afterAll`의 `mongo.stop()` → `mongo?.stop()` (두 테스트 파일). 파생 TypeError가 사라져 원인 에러만 남는다.
  - 조치 후 같은 재현: `FAIL` + `BinaryNotFoundError` 1건, `Test Files 1 failed`, exit 1
  - 실패는 계속 exit code로 드러나므로 CI·오케스트레이터는 exit code와 "Test Files … failed"를 기준으로 판단하면 된다.

## 6. 미검증 영역
- **실제 GitHub 로그인 왕복**: OAuth App의 Client ID/Secret이 `.env.local`에 들어가야 가능하다(사용자 작업). GitHub 응답은 테스트에서 `fetch` 모킹으로만 검증했다.
- 실제 Atlas에서의 로그인·격리·마이그레이션 할당 실행: 사용자가 없어서 하지 않았다(읽기 전용 dry-run만 실행).
- production(`Secure` 쿠키, HTTPS, 배포 `APP_URL`): 로컬만 확인했다.
- `npm run build`: 지시대로 생략했다.
- 프론트 연동(`app/login`, `Header`의 `/api/me`·로그아웃 폼): Frontend 담당 영역이라 확인하지 않았다.

## 7. 보안 메모
- **CLIENT_SECRET**: `process.env`에서 요청 시점에 읽는다. 로그·응답·리다이렉트 URL에 넣지 않는다(토큰 교환 POST body에만 사용).
- **세션 토큰**: `crypto.randomBytes(32)`(base64url). DB에는 sha256 해시만 저장하므로 DB가 유출돼도 쿠키를 재구성할 수 없다.
  - 조회 시 `expiresAt > now`를 확인한다. TTL 인덱스는 약 60초 주기라 그 사이 만료 세션도 거부된다.
- **쿠키**: `HttpOnly`, `SameSite=Lax`, `Path=/`, production에서 `Secure`.
  - Lax라서 외부 사이트의 POST `/auth/logout`·API 쓰기 요청에는 쿠키가 실리지 않는다(CSRF 완화).
- **OAuth state**: 32바이트 랜덤, 10분 쿠키, `timingSafeEqual`(길이 먼저 확인). callback 결과와 관계없이 삭제한다.
- **GitHub access token**: 사용자 조회 1회에만 쓰고 저장·로깅하지 않는다. scope는 `read:user`.
- **로그**: 실패 시 `e.message`만 남긴다. 토큰·code·secret은 로그에 없다.
- **인가**: 모든 `/api/**`가 `handle()` 한 곳에서 `requireUser`를 거친다. 새 API도 `handle`을 쓰면 인증이 빠질 수 없다.
  - 남의 리소스는 404로 존재 여부를 숨긴다. `userId`는 body로 지정할 수 없다(화이트리스트).
- **proxy**: 쿠키 존재만 보는 낙관적 검사다. 실제 보호는 API 401이 담당한다. proxy를 우회해 화면 HTML을 받아도 데이터는 받을 수 없다.
- **open redirect 없음**: 리다이렉트 대상은 모두 고정 경로(`/`, `/login?error=…`)와 GitHub authorize URL이다.

## 8. 차단/질문
- **레이트 리밋 미적용** (`/auth/github/callback`, `/auth/logout`, API 쓰기): 새 의존성·과설계 금지와 서버리스 환경의 인메모리 리미터 한계 때문에 넣지 않았다. callback은 GitHub가 발급한 1회용 code가 있어야 DB에 쓸 수 있어 남용 여지가 작다. 배포 전에 플랫폼(Vercel WAF 등) 레벨 적용 여부를 결정해 달라.
- `lib/db.ts`(파일 담당표에 없음)의 공통 `toJSON`에 `delete ret.userId` 한 줄을 추가했다. "응답에 userId 노출 안 함"을 모델마다 반복하지 않기 위해서다. Frontend 담당 파일은 건드리지 않았다.
- 기존 CRUD 로직을 바꿔야 하는 상황은 없었다.

## 9. QA 재작업 — D2 진행률 집계 소유자 조건 (2026-09-15)

### 문제
`withProgress` 집계는 `weeklyPlanId`만으로 할 일을 셌다. DB에 남의 할 일이 내 주간 계획에 연결돼 있으면 내 `todoCount`/`progress`에 포함됐다. API로는 이런 연결을 만들 수 없지만(`assertRef`), 방어가 필요하다는 지적이다.

### 조치 (`models/WeeklyPlan.ts` `withProgress`)
- `$group` 키를 `weeklyPlanId` → `{ plan: weeklyPlanId, user: userId }`로 바꿨다.
- 결과를 계획에 붙일 때 `${plan._id}:${plan.userId}` 키로만 찾는다. 계획 소유자와 다른 소유자의 할 일은 무시된다.
- 계획별 userId 기준이라 여러 사용자의 계획을 한 번에 넘겨도 올바르다.
- 여전히 집계 쿼리 1번이다(N+1 없음).
- `$or`로 계획별 조건을 거는 방식은 계획이 0개일 때 `$or: []`가 쿼리 오류를 내므로 쓰지 않았다.
- **바뀌지 않은 것**:
  - 함수 시그니처(`withProgress(plans)`)와 호출부 4곳
  - 진행률 계산식 `calcProgress(doneCount, todoCount)`
  - 응답 형태 `{ ...plan, todoCount, doneCount, progress }`
  - 스키마
- 계획이 0개면 `$in: []`라 빈 결과가 나오고, 기존과 같게 동작한다.

### 테스트 (`tests/auth.test.ts`)
- 새 테스트: `진행률 집계 소유자 조건 (QA D2) > DB에 직접 연결된 남의 할 일은 내 주간 계획 progress/todoCount에 포함 안 됨`
  - A의 계획에 A의 done 할 일 1개를 API로 만든다.
  - B 소유의 todo 상태 할 일 3개를 `insertMany`로 A의 계획에 직접 연결한다.
  - 단건 `GET /api/weekly-plans/[id]`와 목록 `GET /api/weekly-plans` 모두 `{ todoCount: 1, doneCount: 1, progress: 100 }`이다.
  - 수정 전 로직이었다면 `todoCount 4, progress 25`가 나와 실패한다.
- 기존 테스트 assertion 변경 없음.

### 검증 (실제 실행)
| 명령 | 결과 |
| --- | --- |
| `npx tsc --noEmit` | 첫 실행 exit 1 — 오류 2건 모두 `components/Header.tsx`(37·38행, Frontend 담당, 동시 수정 중). Backend 파일 오류 0. 재실행 exit 0 |
| `npm run lint` | exit 0 |
| `npx vitest run` | exit 0, **Test Files 4 passed, Tests 40 passed**, skipped 0 (api 13 + auth 12 + QA가 추가한 auth-edge 11 + progress 4). 기존 진행률 테스트 `할 일 4개 중 done 1개 → progress 25 (목록·단건)`, `연결된 할 일 0개 → progress 0` 통과 |

dev 서버는 재시작하지 않았고, `.env*` 파일은 읽지 않았으며, git 명령은 쓰지 않았다.

### 9-2. 리뷰어(architect) 제안 반영 — Low 3건 + 문서 1건

| # | 제안 | 조치 | 파일 |
| --- | --- | --- | --- |
| 1 | 로그아웃 CSRF | `Origin` 헤더가 있고 `new URL(APP_URL \|\| req.url).origin`과 다르면 **403** `{ error: { code: "FORBIDDEN", message: "Cross-origin request", details: null } }` 반환. DB 연결·세션 삭제·쿠키 변경 전에 반환한다. Origin이 없으면 기존대로 303 | `app/auth/logout/route.ts` |
| 2 | 재로그인 시 이전 세션 잔존 | callback에서 `createSession` 직전에 `deleteSession(req)` 호출. 요청에 실린 session 쿠키의 문서를 지운다(없거나 위조 토큰이면 삭제 0건). 세션 고정 방지 테스트 유지 | `app/auth/github/callback/route.ts` |
| 3 | GitHub 응답·타임아웃 | `typeof gh.avatar_url === "string"` 검사 추가. 토큰 교환·사용자 조회 두 fetch에 `signal: AbortSignal.timeout(10_000)` 추가. 둘 다 실패하면 기존 흐름대로 `/login?error=oauth`, 사용자·세션 생성 없음 | `app/auth/github/callback/route.ts` |
| 4 | 문서 | ①"환경 변수" 절: E2E(`npx playwright test`)가 `.env.local`의 실제 DB에 `[e2e-check]` 데이터를 쓰고 끝나면 지운다는 경고. ②"배포할 때" 절: 리다이렉트 주소는 `APP_URL`이 아니라 `req.url`(Host 헤더) 기준이므로 리버스 프록시·CDN 뒤에서는 원래 Host가 전달되는지 확인. 코드 변경은 이번 범위 아님 | `docs/AUTH_SETUP.md` |

계약 변화: `POST /auth/logout`에 **403 `FORBIDDEN`**(다른 출처의 Origin)이 추가됐다. 같은 출처 폼 제출은 브라우저가 같은 Origin을 보내므로 프론트 동작은 그대로다. 그 밖의 라우트 계약·스키마는 바뀌지 않았다.

#### 추가 테스트 (`tests/auth.test.ts` "리뷰어 제안 보강", 3건)
1. `로그아웃: 다른 Origin → 403(세션·쿠키 유지), 같은 Origin·Origin 없음 → 303`
   - 다른 Origin: 403, `set-cookie` 없음, 세션 문서 1건 유지, 이후 API 200
   - 같은 Origin, Origin 없음: 둘 다 303, 해당 사용자 세션 0건
2. `로그인 상태에서 재로그인 → 이전 세션 문서 삭제, 새 세션 1건`
   - 세션 문서가 1건뿐이고 tokenHash가 바뀜
   - 이전 토큰 401, 새 토큰 200
3. `GitHub avatar_url 없음 → oauth, fetch 타임아웃(AbortSignal) → oauth, 사용자·세션 생성 없음`
   - 두 fetch 모두 `AbortSignal` 전달 확인
   - `TimeoutError` DOMException을 던지면 oauth
   - User·Session 0건
   - 실제 10초를 기다리지 않도록 타임아웃 예외를 모킹했다

기존 테스트 assertion 변경 없음. QA의 `auth-edge.test.ts > 세션 고정 방지` 테스트 통과.

#### 검증 (실제 실행)
| 명령 | 결과 |
| --- | --- |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 |
| `npx vitest run` | exit 0, **Test Files 4 passed, Tests 43 passed**, skipped 0. 타임아웃 테스트의 stderr는 callback의 `console.error("GitHub login failed: …")` 정상 로그다 |
| dev 서버 curl `POST /auth/logout` (쿠키 없음) | `Origin: https://evil.example` → 403 FORBIDDEN JSON / `Origin: http://localhost:3000` → 303 `/login` / Origin 없음 → 303 `/login` (재시작 없이 반영) |

dev 서버 재시작 없음, 모델 스키마 변경 없음, `.env*` 읽기 없음, git 명령 없음.
