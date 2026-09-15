# 02-backend-report (T03 Backend, M1+M2)

## 1. 만든/바꾼 파일
| 파일 | 내용 |
| --- | --- |
| (스캐폴딩) `package.json`, `app/`, `public/`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `AGENTS.md`, `CLAUDE.md`(루트, `@AGENTS.md`만 있음), `README.md` | create-next-app 16.3.5 (TS, Tailwind v4, App Router, ESLint, `@/*`, git 초기화 안 함). `app/page.tsx`는 스캐폴딩 그대로 |
| `.gitignore` | `.env*` 무시 + `!.env.example` 추가 (`.env.local`은 무시됨을 확인) |
| `.env.example` | `MONGODB_URI=` 자리만 있음 |
| `lib/db.ts` | Mongoose 연결 전역 캐시(`globalThis`), `MONGODB_URI` 없으면 에러, 연결 실패는 캐시하지 않음. 공통 `toJSON` 옵션 |
| `lib/api.ts` | `handle()` (요청 시점 DB 연결 + 에러 포맷 통일), `readBody`(허용 필드만 추림), `assertObjectId`, `findOr404`, `assertRef`(상위 항목 존재 확인) |
| `lib/date.ts` | `isDateString`(YYYY-MM-DD이면서 실제로 있는 날짜), `isMonday` |
| `lib/progress.ts` | `calcProgress(done, total)` |
| `models/YearGoal.ts`, `models/WeeklyPlan.ts`, `models/Todo.ts` | PLAN 3장 스키마. `WeeklyPlan.ts`에 진행률 집계 `withProgress()` |
| `app/api/todos/route.ts`, `app/api/todos/[id]/route.ts` | 할 일 API |
| `app/api/weekly-plans/route.ts`, `app/api/weekly-plans/[id]/route.ts` | 주간 계획 API |
| `app/api/year-goals/route.ts`, `app/api/year-goals/[id]/route.ts` | 1년 목표 API |
| `vitest.config.mts` | `@` 경로 alias, node 환경 |
| `tests/progress.test.ts`, `tests/api.test.ts` | 단위 테스트 + 통합 테스트(mongodb-memory-server로 route handler를 직접 호출) |
| `docs/PLAN.md` | M1/M2 체크박스 갱신 |

의존성: `mongoose@^9.10.1`, (dev) `vitest@^4.1.11`, `mongodb-memory-server@^11.2.0`. @dnd-kit/core와 Playwright는 설치하지 않음.

## 2. 공통 규칙
- Base URL: `/api`, 인증 없음(PLAN: 단일 사용자)
- 요청 body: JSON 객체. 허용 필드 외에는 **조용히 무시**
- 응답 id 필드: **`id`** (24자리 hex 문자열). `_id`, `__v`는 응답에 없음. 참조 필드(`weeklyPlanId`, `yearGoalId`)도 문자열 또는 `null`
- 연결 해제: 해당 필드에 `null` 전달. 필드를 빼면 기존 값 유지(PATCH는 부분 수정)
- 날짜: `"YYYY-MM-DD"` 문자열. `weekStart`는 반드시 **월요일**
- 성공: 조회/수정 `200`, 생성 `201`(생성된 객체), 삭제 `204`(body 없음)
- 에러 포맷 (모든 에러 공통):
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid input", "details": { "status": "`invalid` is not a valid enum value for path `status`." } } }
```
| status | code | 발생 조건 | details |
| --- | --- | --- | --- |
| 400 | `INVALID_JSON` | body가 JSON 객체가 아님 | `null` |
| 400 | `VALIDATION_ERROR` | 필수 누락, enum 위반, 날짜 형식, 월요일 아님, year가 정수 아님, 잘못된 `?date=` | `{ 필드: 메시지 }` 또는 `null` |
| 400 | `INVALID_ID` | path `id` 또는 `?weeklyPlanId=`가 ObjectId 형식이 아님 | `null` |
| 400 | `INVALID_REFERENCE` | `weeklyPlanId`/`yearGoalId`가 존재하지 않는 항목을 가리킴 | `null` |
| 404 | `NOT_FOUND` | 없는 id | `null` |
| 500 | `INTERNAL_ERROR` | DB 연결 실패 등 | `null` |

프론트는 `error.code`로 분기하고, 폼 필드 에러는 `error.details`를 쓰면 된다. `details` 메시지는 Mongoose 원문(영문)이다.

## 3. 공통 타입
```ts
type Status = "todo" | "doing" | "done";

type Todo = {
  id: string;
  title: string;            // 필수, 앞뒤 공백 제거
  date: string | null;      // "YYYY-MM-DD"
  status: Status;           // 기본 "todo"
  weeklyPlanId: string | null;
};

type WeeklyPlan = {
  id: string;
  title: string;
  weekStart: string;        // "YYYY-MM-DD", 월요일
  yearGoalId: string | null;
  todoCount: number;        // 연결된 할 일 수 (조회할 때 계산)
  doneCount: number;        // 그중 done 수 (조회할 때 계산)
  progress: number;         // 0~100 정수 (조회할 때 계산)
};

type YearGoal = { id: string; title: string; year: number /* 정수 */ };
```

### 진행률 계산 규칙
- `progress = todoCount === 0 ? 0 : Math.round(doneCount / todoCount * 100)`
- `Math.round`라서 .5는 올린다(12.5 → 13). 1/3 → 33, 2/3 → 67
- DB에 저장하지 않는다. 주간 계획을 GET/POST/PATCH할 때마다 집계 쿼리 1번으로 계산하므로 목록 크기와 관계없이 N+1이 없다
- **할 일을 바꿔도 할 일 응답에는 진행률이 없다.** 할 일을 생성·수정·삭제한 뒤 진행률이 필요하면 `GET /api/weekly-plans`(또는 `/[id]`)를 다시 호출해야 한다

## 4. API 계약

### 할 일
#### `GET /api/todos?date=&weeklyPlanId=` → 200
- query는 모두 선택이며 AND 조건으로 적용. 정렬: `date` 오름차순(`null`이 먼저), 그다음 생성 순서
- `date` 형식 오류 → 400 `VALIDATION_ERROR`, `weeklyPlanId` 형식 오류 → 400 `INVALID_ID`
```json
[{ "id": "66e6a1f0c2a4b1d2e3f40001", "title": "보고서 초안", "date": "2026-09-15", "status": "todo", "weeklyPlanId": "66e6a1f0c2a4b1d2e3f40010" }]
```

#### `POST /api/todos` → 201
- body: `{ "title": string(필수), "date"?: "YYYY-MM-DD" | null, "weeklyPlanId"?: string | null }` (`status`는 받지 않고 항상 `todo`로 생성)
```json
// 요청
{ "title": "보고서 초안" }
// 201
{ "id": "66e6a1f0c2a4b1d2e3f40001", "title": "보고서 초안", "date": null, "status": "todo", "weeklyPlanId": null }
```
- 에러: 제목 누락 → 400 `VALIDATION_ERROR` (`details.title`), 없는 주간 계획 → 400 `INVALID_REFERENCE`

#### `GET /api/todos/[id]` → 200 `Todo`
#### `PATCH /api/todos/[id]` → 200 `Todo`
- body(일부만 보내도 됨): `{ "title"?, "date"?, "status"?: Status, "weeklyPlanId"?: string | null }`
```json
// 드래그로 상태 변경
{ "status": "doing" }
// 400
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid input", "details": { "status": "`invalid` is not a valid enum value for path `status`." } } }
// 연결 해제
{ "weeklyPlanId": null }
```
#### `DELETE /api/todos/[id]` → 204
- 공통: 없는 id → 404 `NOT_FOUND`, id 형식 오류 → 400 `INVALID_ID`. 존재 확인(404)을 body 검증(400)보다 먼저 한다

### 주간 계획
#### `GET /api/weekly-plans` → 200 `WeeklyPlan[]`
- 정렬: `weekStart` 오름차순. 필터·페이지네이션 없음
```json
[{ "id": "66e6a1f0c2a4b1d2e3f40010", "title": "38주차", "weekStart": "2026-09-14", "yearGoalId": null, "todoCount": 4, "doneCount": 1, "progress": 25 }]
```
#### `POST /api/weekly-plans` → 201 `WeeklyPlan`
- body: `{ "title": string(필수), "weekStart": "YYYY-MM-DD"(필수, 월요일), "yearGoalId"?: string | null }`
```json
// 요청
{ "title": "38주차", "weekStart": "2026-09-14" }
// 201
{ "id": "66e6a1f0c2a4b1d2e3f40010", "title": "38주차", "weekStart": "2026-09-14", "yearGoalId": null, "todoCount": 0, "doneCount": 0, "progress": 0 }
// weekStart가 "2026-09-15"(화요일)이면 400
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid input", "details": { "weekStart": "weekStart must be a Monday in YYYY-MM-DD" } } }
```
#### `GET /api/weekly-plans/[id]` → 200 `WeeklyPlan`
#### `PATCH /api/weekly-plans/[id]` → 200 `WeeklyPlan`
- body: `{ "title"?, "weekStart"?, "yearGoalId"?: string | null }`. 없는 1년 목표 → 400 `INVALID_REFERENCE`
#### `DELETE /api/weekly-plans/[id]` → 204
- 연결돼 있던 할 일은 삭제되지 않고 `weeklyPlanId`만 `null`로 바뀐다

### 1년 목표
#### `GET /api/year-goals` → 200 `YearGoal[]` (정렬: `year` 오름차순)
#### `POST /api/year-goals` → 201 `YearGoal`
```json
// 요청
{ "title": "책 24권 읽기", "year": 2026 }
// 201
{ "id": "66e6a1f0c2a4b1d2e3f40020", "title": "책 24권 읽기", "year": 2026 }
// year: 2026.5 → 400 VALIDATION_ERROR (details.year)
```
#### `GET /api/year-goals/[id]` → 200, `PATCH /api/year-goals/[id]` `{ "title"?, "year"? }` → 200
#### `DELETE /api/year-goals/[id]` → 204
- 연결돼 있던 주간 계획은 삭제되지 않고 `yearGoalId`만 `null`로 바뀐다

## 5. 검증 결과 (2026-09-15 실제 실행)
| 명령 | 결과 |
| --- | --- |
| `npx vitest run` | **2 files, 17 tests passed** (실패 0) |
| `npx tsc --noEmit` | 통과 (exit 0). 단, `next build`/`next typegen`이 만드는 `LayoutProps` 타입이 있어야 하므로 `.next`가 없는 새 클론에서는 build를 먼저 실행해야 함 |
| `npm run build` (`MONGODB_URI` 제거 상태) | 통과. API 6개 경로 모두 `ƒ (Dynamic)`. DB 연결은 요청 시점에만 일어남 |
| `npm run lint` | 통과 (exit 0) |
| `next start` + Atlas(`.env.local`)로 읽기 전용 GET 호출 | `/api/year-goals`, `/api/weekly-plans`, `/api/todos` 모두 `[] 200`, `/api/todos/bad` → 400 `INVALID_ID`. 서버 로그에 에러 없음 |

PLAN M2 완료 기준과 테스트 대응:
| 기준 | 테스트 (`tests/api.test.ts`) |
| --- | --- |
| `POST /api/todos {title}` → 201, `status: "todo"` | `todos > POST {title} → 201 ...` |
| `PATCH {status:"invalid"}` → 400 | `todos > PATCH {status: invalid} → 400 ...` |
| 없는 id 조회·수정·삭제 → 404 | `todos > 없는 id ...`, `weekly-plans > ... 없는 id → 404`, `year-goals > CRUD ...` |
| 주간 계획 삭제 후 `weeklyPlanId === null` | `weekly-plans > 주간 계획 삭제 → ...` |
| 할 일 4개 중 done 1개 → 25 | `weekly-plans > 할 일 4개 중 done 1개 ...` (목록·단건) + `tests/progress.test.ts` |
| 연결된 할 일 0개 → 0 | `weekly-plans > 연결된 할 일 0개 ...` + `tests/progress.test.ts` |

그 외에 없는 상위 항목 연결 → 400, `null`로 연결 해제, 날짜·월요일·정수 검증, 목록 필터, 1년 목표 삭제 시 연결 해제도 테스트한다.

M1 완료 기준 중 "필수 필드 없이 저장 시 Mongoose 검증 에러"는 POST 제목 누락 → 400 `VALIDATION_ERROR` 테스트로 확인했다.

## 6. 미검증 영역과 알려진 제약
- Atlas: 오케스트레이터가 연결을 확인했고, 이번에 앱을 거친 **읽기 전용** GET도 확인했다. **앱을 거친 생성·수정·삭제(CRUD)는 실제 Atlas에서 확인하지 않았다**(실제 DB에 데이터를 쓰지 않으려고). `npm run dev`는 실행하지 않았고 `next start`로만 확인했다
- 상위 항목 삭제와 하위 연결 해제는 트랜잭션으로 묶여 있지 않다. 삭제 직후 `updateMany`가 실패하면 할 일/주간 계획에 끊긴 참조가 남을 수 있다(코드에 `ponytail:` 주석 있음). Atlas는 트랜잭션을 지원하므로 필요하면 `session.withTransaction`으로 감싸면 된다
- 목록 API에 페이지네이션이 없다. 단일 사용자이고 PRD에 요구가 없어서 뺐다
- 레이트 리밋과 인가 검사가 없다. PLAN이 로그인 없는 단일 사용자로 결정했기 때문이다. 외부에 공개 배포하려면 인증을 먼저 붙여야 한다
- 문자열 필드에 숫자를 보내면 Mongoose가 문자열로 바꿔 저장한다(`title: 123` → `"123"`). `year: "2026"`도 숫자로 바뀐다
- 빌드할 때 `/Users/mjade/package-lock.json` 때문에 Turbopack이 workspace root를 잘못 추정한다는 경고가 나온다. 빌드는 성공한다. 없애려면 `next.config.ts`에 `turbopack.root`를 지정한다(범위 밖이라 손대지 않음)

## 7. 프론트엔드 주의점
- id 필드는 `id`다 (`_id` 아님)
- 드래그로 상태를 바꿀 때는 `PATCH /api/todos/[id]` `{ "status": "done" }`를 보낸다. 실패하면 400/404/500이고 body는 `{ error }` 형태다
- 진행률은 주간 계획 응답에만 있다. 할 일을 바꾼 뒤 진행률을 갱신하려면 주간 계획을 다시 조회한다
- 할 일 폼에서 주간 계획 연결을 해제할 때는 `weeklyPlanId: null`을 보낸다. 빈 문자열 `""`은 400 `INVALID_REFERENCE`가 된다. 날짜를 지울 때도 `date: null`을 보낸다(`""`은 400)
- `weekStart`는 월요일이어야 한다. 폼에서 날짜를 받으면 그 주의 월요일로 바꿔서 보낸다(백엔드에는 변환 함수가 없고 검증만 한다. 검증 함수는 `lib/date.ts`)
- `DELETE`는 204이고 body가 없다. `res.json()`을 호출하면 안 된다
- route handler는 `force-static` 없이 동적 실행되므로 클라이언트 fetch 결과가 캐시되지 않는다
