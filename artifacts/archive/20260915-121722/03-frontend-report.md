# 03-frontend-report (T04 Frontend, M3)

## 1. 만든/바꾼 파일
| 파일 | 내용 |
| --- | --- |
| `package.json` / `package-lock.json` | `@dnd-kit/core@^6.3.1` 추가 (그 외 의존성 추가 없음) |
| `lib/client.ts` | 클라이언트 전용. 계약 타입(`Todo`/`WeeklyPlan`/`YearGoal`/`Status`), 유일한 fetch 래퍼 `api()`, `ApiError`, 목록 훅 `useList()`, 제출 훅 `useAction()`, 입력-에러 연결 `fieldError()`, `today()`, `toMonday()` |
| `components/ui.tsx` | 공통 클래스 문자열, 4상태 컴포넌트 `AsyncState`, `FormError`, 진행률 표시 `PlanProgress`(`<progress>`) |
| `components/TodoForm.tsx` | 할 일 생성/수정 폼 (제목·날짜·상태(수정 시)·주간 계획 연결) |
| `components/TodoBoard.tsx` | 홈 화면 본체: 이번 주 진행률, 할 일 추가, 날짜 필터, 칸반 3컬럼 + dnd-kit |
| `app/page.tsx` | 서버 컴포넌트. `searchParams.date`를 읽어 `TodoBoard`에 전달 |
| `app/weekly/page.tsx` | 주간 계획 화면 (`PlanForm` 포함) |
| `app/goals/page.tsx` | 1년 목표 화면 (`GoalForm` 포함) |
| `app/layout.tsx` | `lang="ko"`, 제목, 상단 네비게이션(칸반 보드/주간 계획/1년 목표), `main` 컨테이너. Geist 폰트 제거 |
| `app/globals.css` | 스캐폴딩 다크 모드 변수 제거, 라이트 단일 테마 + 한글 시스템 폰트 (대비 보장 목적) |
| `docs/PLAN.md` | M3 체크박스 6개 완료, M1 의존성 항목에 @dnd-kit/core 설치 반영(playwright 남아 있어 체크는 유지 안 함) |

백엔드 파일(`app/api/**`, `lib/api.ts`, `lib/db.ts`, `lib/date.ts`, `lib/progress.ts`, `models/*`)과 테스트 파일은 수정하지 않았다.

## 2. 화면별 기능
### `/` 칸반 보드 (`components/TodoBoard.tsx`)
- **이번 주 계획 진행률**: `GET /api/weekly-plans` 결과 중 `weekStart === toMonday(오늘, 로컬 날짜)`인 계획만 제목 + 진행률 막대 + `N% (done/total)` 표시. 없으면 주간 계획 화면 링크
- **할 일 추가**: 제목(필수), 날짜(선택, 날짜 필터가 걸려 있으면 그 날짜가 기본값), 주간 계획 select(“연결 안 함” = `null`)
- **날짜 필터**: 기본 전체. `<input type="date">` 변경 시 `router.push("/?date=YYYY-MM-DD")`, 값을 지우거나 “전체 보기” → `/`
- **칸반**: todo/doing/done 3컬럼(모바일 1열, `md` 이상 3열), 컬럼 제목에 개수. 카드: 제목, 날짜, 연결된 주간 계획명, 이동 핸들, 수정, 삭제
- **수정**: 카드 자리에 `TodoForm`(제목·날짜·상태·주간 계획). 날짜 비우기 → `date: null`, 연결 해제 → `weeklyPlanId: null`
- **삭제**: `confirm()` 후 `DELETE`
- **드래그 앤 드롭**: `PointerSensor`(5px 이동 후 시작 → 버튼 클릭과 충돌 없음) + `KeyboardSensor`
  - 드래그는 카드 안의 핸들 버튼(`setActivatorNodeRef`)에서만 시작 → 카드 안 수정/삭제 버튼의 Enter/Space가 드래그를 시작하지 않음
  - 키보드: 핸들에 포커스 → Space/Enter로 들기 → 방향키 한 번에 이웃 컬럼으로 이동(커스텀 `coordinateGetter`, →/↓ 다음, ←/↑ 이전) → Space/Enter로 놓기, Esc 취소
  - 스크린리더 안내/알림 문구 한국어로 지정(`accessibility.announcements`, `screenReaderInstructions`)
  - 드롭 → 해당 카드 status를 즉시 변경 → `PATCH /api/todos/[id] {status}` → 성공 시 주간 계획 재조회, 실패 시 **그 카드만** 이전 status로 되돌리고 `role="alert"` 메시지 표시
- 할 일 생성·수정·삭제 성공 시 `todos.reload()` + `plans.reload()` (진행률 갱신)

### `/weekly` 주간 계획
- 목록: 제목, `weekStart` 주, 연결된 1년 목표명(없으면 “연결 안 됨”), 진행률 막대 + `N% (done/total)`
- 생성/수정 폼: 제목(필수), 날짜(아무 날짜 선택 → `toMonday()`로 변환해 `weekStart` 전송, 폼 아래에 “YYYY-MM-DD(월)부터 시작하는 주로 저장됩니다” 안내), 1년 목표 select(“연결 안 함” = `null`)
- 삭제: `confirm()`(연결된 할 일은 연결만 해제된다고 안내) 후 `DELETE`
- 1년 목표 목록 조회 실패 시 폼 위에 오류 + 다시 시도

### `/goals` 1년 목표
- 목록: 연도, 제목. 생성/수정 폼: 제목(필수), 연도(`type=number step=1`, 기본값 올해, `Number()`로 전송). 삭제는 `confirm()` 후 `DELETE`

## 3. 4상태 처리
`useList(path)` + `AsyncState`로 모든 목록에 동일하게 적용한다.
| 상태 | 처리 |
| --- | --- |
| 로딩 | `data`가 아직 없음 → `role="status"` “불러오는 중…”. path가 바뀌면(날짜 필터) 이전 결과를 버리고 로딩으로 돌아감 |
| 정상 | 렌더 함수로 목록 렌더 |
| 비어 있음 | 화면별 안내 문구 (예: “이 날짜에 할 일이 없습니다.”, “이번 주 주간 계획이 없습니다. 주간 계획 만들기”) |
| 오류 | `role="alert"` “불러오지 못했습니다. {사유}” + “다시 시도” 버튼(`retry`: 로딩 상태로 되돌린 뒤 재요청) |

- 요청 취소: `useList`는 effect cleanup에서 `AbortController.abort()` → 필터를 빠르게 바꿔도 이전 응답이 덮어쓰지 않음
- 중복 제출: `useAction`의 `pending` 동안 제출/삭제 버튼 `disabled`, 실행 중 재호출 무시
- 변경 후 `reload()`는 기존 데이터를 유지한 채 다시 조회(깜빡임 없음)
- 폼 오류: 폼 하단 `role="alert"` 메시지. `error.details`에 해당 필드 키가 있으면 그 입력에 `aria-invalid` + `aria-describedby`로 메시지 연결

## 4. 계약 사용 방식 (`artifacts/02-backend-report.md` 준수)
- id 필드 `id`만 사용
- `api()` 하나로 모든 호출. `204`면 body를 읽지 않고 `undefined` 반환(`res.json()` 호출 안 함)
- 에러 `{error:{code,message,details}}` → `code`별 한국어 안내(`VALIDATION_ERROR`, `INVALID_REFERENCE`, `NOT_FOUND`, `INTERNAL_ERROR`, 그 외 “요청에 실패했습니다 (status)”) + 원문 `message` + `details` 값들을 함께 표시. 네트워크 실패는 “서버에 연결할 수 없습니다”
- `weekStart`: `toMonday()`로 월요일 변환 후 전송 (UTC 기준 문자열 계산이라 시간대 영향 없음. `2026-09-15→09-14`, `09-20(일)→09-14`, `09-21→09-21`, `2026-01-01→2025-12-29` 등 node로 확인)
- 날짜/연결 해제: 빈 값이면 `null` 전송 (`""` 전송하지 않음)
- 할 일 생성 시 `status`는 보내지 않음(백엔드가 `todo`로 생성). 수정 폼만 `status` 포함
- 진행률은 할 일 응답에 없으므로 할 일 변경 성공 후 항상 `GET /api/weekly-plans` 재조회

## 5. 검증 (2026-09-15 실제 실행)
| 명령 | 결과 |
| --- | --- |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 (경고·에러 없음) |
| `npm run build` | 성공. `/` ƒ(Dynamic, searchParams 사용), `/weekly`·`/goals` ○(Static), API 6개 ƒ |
| `npx vitest run` | 2 files, 17 tests passed (기존 백엔드 테스트 영향 없음) |

### dev 서버 + curl (포트 3100, Atlas `todo` DB)
- `GET /`, `/weekly`, `/goals`, `/?date=2026-09-15` → 모두 **200**
- API 흐름(`[e2e-check]` 데이터): 목표 생성 → 주간 계획(`2026-09-14`) 생성 → 목표 연결 PATCH 200(`yearGoalId` 반영) → 할 일 2개 생성·연결 → 계획 `0% (0/2)` → t1 `doing` PATCH 후 GET해도 `doing` 유지 → t1 `done` → **50% (1/2)** → `?date=2026-09-15` 필터에 t1만 → `status:"bad"` → 400 `{error:{code:"VALIDATION_ERROR",...,details:{status}}}` → t2 `weeklyPlanId:null, date:null` → **100% (1/1)** → t1 DELETE 204(body 없음) → **0% (0/0)** → 전부 삭제

### 브라우저 확인 (Claude in Chrome, dev 서버)
- 칸반 화면 렌더, 이번 주 진행률, 폼, 3컬럼 표시 확인(스크린샷)
- **키보드 드래그**: 핸들 포커스 → Space → → 한 번에 “진행 중” 컬럼으로 이동(스크린샷) → → “완료” → Space. 서버 로그 `PATCH /api/todos/:id 200`, DB `status:"done"`, 화면 진행률이 새로고침 없이 `0% (0/1)` → `100% (1/1)`
- **포인터 드래그**: 확장의 `left_click_drag`로는 드래그가 시작되지 않음(중간 pointermove가 부족한 도구 한계로 추정). 페이지에서 `PointerEvent`(down → move 20단계 → up)를 발생시켜 확인: “완료 → 할 일” 이동, DB `status:"todo"`, 진행률 `0% (0/1)`로 갱신
- **실패 시 원위치**: 서버에서 해당 할 일을 curl로 먼저 삭제한 뒤 “할 일 → 진행 중” 드래그 → PATCH 404 → 카드가 “할 일” 컬럼에 남음 + 알림 “"[e2e-check] drag" 상태를 저장하지 못해 원래 컬럼으로 되돌렸습니다. 항목을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다: Resource not found”
- 콘솔 에러는 모두 브라우저 확장(`chrome-extension://...`)에서 나왔다. Next 오버레이의 hydration 경고 1건은 확장이 `<html>`에 `data-hwp-extension` 속성을 넣어서 생긴 것(앱 코드 원인 아님)
- 검증 데이터 정리: todos/weekly-plans/year-goals 모두 `[e2e-check]` 0건 확인. 브라우저 탭 닫음, dev 서버 종료(포트 3100 비어 있음 확인)

## 6. 미검증 영역
- 실제 마우스 드래그(OS 입력)와 **터치 드래그**: 합성 PointerEvent로만 확인. 모바일 터치는 미검증 (`touch-none` 핸들 + PointerSensor라 동작은 기대되지만 확인 안 함) → QA E2E(Playwright)에서 확인 필요
- `/weekly`, `/goals` 화면과 할 일 생성·수정·삭제 **폼 조작은 브라우저에서 클릭해보지 않음**. HTTP 200 + 같은 API를 curl로 확인 + tsc/lint/build까지만
- 목록 조회 오류 상태, 폼 필드 에러(`aria-invalid` 연결) 화면: 코드상 구현만, 강제 실패로 화면 확인은 드래그 404 한 건뿐
- 모바일 폭(약 400px) 레이아웃, 스크린리더 실제 낭독, 색 대비 수치 측정 미검증
- 방향키 컬럼 이동은 데스크톱 3열에서만 확인. 모바일 1열에서 ↑/↓ 이동은 미검증

## 7. 계약 이슈 / PRD 해석 (백엔드 수정 없음)
1. **에러 message/details가 영문 원문**(Mongoose 메시지, “Resource not found” 등). 계약대로 그대로 보여 주되, 사용자가 이해할 수 있게 `code`별 한국어 안내를 앞에 붙였다. 한국어 details가 필요하면 백엔드 변경 필요
2. PRD “조회: 일일 목록 / 칸반 보드”: 별도 일일 목록 뷰를 만들지 않고 **칸반 + 날짜 필터(`?date=`)**로 일일 조회를 제공했다(오케스트레이터 지시 기준). 별도 목록 뷰가 필요하면 PRD/PLAN 확인 필요
3. 주소창에 잘못된 `?date=`를 넣으면 백엔드 400 → 칸반이 오류 상태(메시지 + 다시 시도)로 표시된다. 다시 시도해도 같은 결과이며 “전체 보기”로 빠져나올 수 있다
4. “이번 주” 판정은 브라우저 로컬 날짜 기준 `toMonday(today())`. 서버 시간대와 무관
5. 할 일이 삭제되지 않은 채 연결된 주간 계획이 다른 곳에서 삭제되면 카드의 계획명은 “주간 계획 없음”으로 보인다(재조회 시 백엔드가 `null`로 바꿔 줌) — 문제 없음

## 8. UI 리디자인 (2026-09-15, 사용자 피드백 "구닥다리 느낌" → 밝고 컬러풀한 카드형)
기능·API 호출·상태 로직·dnd-kit 설정(센서, `columnJump`, 낙관적 반영/롤백)·4상태·키보드 접근성은 그대로 두고 스타일과 마크업만 바꿨다. 새 의존성 없음(Tailwind + 인라인 SVG).

### 바꾼 파일
| 파일 | 변경 |
| --- | --- |
| `components/ui.tsx` | 공통 클래스 교체(`inputClass` rounded-xl, `buttonClass`·`primaryButtonClass` rounded-full, 인디고 포인트), `cardClass`·`headingClass` 추가. `AsyncState` 빈 상태를 점선 카드로. `PlanProgress` → `ProgressRing`(인라인 SVG, `role="progressbar"` + `aria-valuenow/min/max` + `aria-label`, 100%면 에메랄드). `IconButton`(aria-label + title 유지) + `EditIcon`/`TrashIcon` |
| `components/Header.tsx` (신규, 처음 만든 `components/Nav.tsx`를 대체·삭제) | 클라이언트 컴포넌트. 로고, `usePathname`으로 현재 메뉴에 `aria-current="page"` + 채워진 pill, 테마 토글(아래 "개발자 테마" 참고) |
| `app/layout.tsx` | 반투명 sticky 헤더(`Header`) + 테마 인라인 스크립트. 오케스트레이터가 넣은 `<html suppressHydrationWarning>` 유지(주석에 data-theme 이유 추가) |
| `app/globals.css` | 테마 토큰(CSS 변수) + `@theme inline` 시맨틱 색 + `@custom-variant dev`. 컬러풀 배경은 따뜻한 off-white(`#fffaf3`) → 옅은 라벤더 세로 그라데이션 |
| `components/TodoBoard.tsx` | 이번 주 진행률: 카드마다 80px 링 + 계획 제목 + "이번 주 N/M 완료". 컬럼 파스텔 톤(`TONE` 맵: 할 일 sky, 진행 중 amber, 완료 emerald, 글자 900 계열) + 헤더 개수 뱃지 + 드롭 대상 ring. 카드: 흰 배경 rounded-2xl, 그림자, hover 시 그림자 강화, 드래그 중 `shadow-xl ring-indigo-400`, 날짜·계획 칩, 핸들은 점 6개 SVG, 수정/삭제는 아이콘 버튼. 헤더/빈 상태에만 이모지 |
| `components/TodoForm.tsx` | 생성 모드: 둥근 큰 입력(`rounded-full`, 라벨은 `sr-only`로 연결 유지) + 포인트 "+ 추가" 버튼 한 줄, 날짜·주간 계획은 아래 작은 입력. 수정 모드: 라벨 보이는 컴팩트 폼 |
| `app/weekly/page.tsx` | 추가 폼 카드, 목록 2열 카드(72px 링 + 주/완료 수 + 목표 칩 + 아이콘 버튼) |
| `app/goals/page.tsx` | 추가 폼 카드, 목록 2열 카드(왼쪽 바이올렛 바 + 연도 뱃지 + 아이콘 버튼) |

### 검증 (실제 실행)
| 항목 | 결과 |
| --- | --- |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 |
| `npx vitest run` | 2 files, 17 tests passed |
| `npm run build` | 지시에 따라 생략 (실행 중인 dev 서버와 `.next` 충돌 방지) |

- 오케스트레이터의 dev 서버(포트 3000)를 그대로 썼다. 새로 띄우거나 종료하지 않았고, 끝난 뒤에도 `GET /` 200 확인
- `[e2e-check]` 데이터(목표 1, 주간 계획 1, 할 일 3개 — todo/doing/done 각 1개, 진행률 33%)로 스크린샷 확인
- **데스크톱(1440px)**: `/`, `/weekly`, `/goals` 스크린샷 확인
  - 스크립트 확인: 각 페이지에서 해당 메뉴만 `aria-current="page"`
  - 링 `aria-valuenow=33`
  - 아이콘 버튼 aria-label 유지("…" 이동/수정/삭제)
  - 컬럼 aria-label "할 일 (1)" 등
  - 가로 스크롤 없음
- **모바일 폭**: `resize_window`가 이 브라우저 창에 적용되지 않았다(`innerWidth` 1440 그대로). 대신 같은 origin의 **400px iframe(내부 viewport 396px)**에 세 페이지를 띄워 확인했다(미디어 쿼리는 iframe viewport 기준)
  - `/`: 칸반 3컬럼이 1열로 쌓임(모두 x16, w364, y 증가)
  - `/weekly`, `/goals`: 카드 1열(x16, w364)
  - 세 페이지 모두 `scrollWidth === innerWidth`(가로 스크롤 없음), 화면 밖으로 넘치는 요소 0개. 스크린샷으로 레이아웃 확인
- 콘솔 에러는 모두 브라우저 확장(`chrome-extension://…`)에서 나왔다. 앱 hydration 오버레이 없음
- 정리: 할 일 3개·계획·목표 DELETE 모두 204, 세 컬렉션 `[e2e-check]` 0건. 브라우저 탭 닫음

### 개발자 테마 + 앱 내 토글 (추가 요청)
터미널/IDE 다크 테마를 하나 더 만들고 헤더 버튼으로 컬러풀 카드형과 전환한다. 컴포넌트를 테마별로 복제하지 않았고, 기능·API·dnd-kit·키보드 동작은 바꾸지 않았다. 새 의존성·웹폰트 없음.

**구조**
- `app/globals.css`
  - `:root` = 컬러풀 토큰, `[data-theme="dev"]` = 같은 변수만 재정의
  - 변수: surface/surface-2/card-line/fg/muted/line, accent 계열, danger, goal, ok, todo·doing·done의 bg/line/fg, `--page` 배경, `--font`
  - `@theme inline`으로 `bg-surface`, `text-fg`, `border-todo-line` 같은 시맨틱 클래스에 연결
  - 개발자 테마 폰트: `ui-monospace, "SF Mono", Menlo, "D2Coding", monospace`. 사각 박스는 `[data-theme="dev"] * { border-radius: 0 !important }` 한 줄로 처리
- `@custom-variant dev`
  - 구조가 다른 부분만 `dev:hidden` / `hidden dev:inline`으로 전환
  - 두 갈래 문구는 `components/ui.tsx`의 `Themed` 헬퍼 사용. 숨는 쪽은 `display:none`이라 스크린리더도 읽지 않음
- 컬러풀 리디자인에서 하드코딩했던 Tailwind 색(zinc/indigo/rose/violet/sky/amber/emerald)을 모두 시맨틱 토큰 클래스로 교체했다. 컬러풀 테마의 모양은 그대로다

**개발자 테마 표현**
| 위치 | 컬러풀 | 개발자 |
| --- | --- | --- |
| 헤더 로고 | ✅ 할 일 관리 | `~/todo ❯ board` (현재 페이지 cmd) |
| 메뉴 | 칸반 보드 / 주간 계획 / 1년 목표 | board / weekly / goals (`aria-current` 동일) |
| 섹션 제목 | 🎯 이번 주 진행률 등 | `// this week`, `// add todo`, `// board --all`, `// new plan`, `// plans`, `// new goal`, `// goals` |
| 페이지 제목 | 🗓️ 주간 계획 / 🏔️ 1년 목표 | `$ ls weekly/` / `$ ls goals/` |
| 할 일 입력 | 둥근 큰 입력 | 입력창 안에 `$ todo add` 프롬프트(aria-hidden, 라벨 "제목"은 sr-only로 유지) |
| 컬럼 헤더 | 할 일 + 개수 뱃지 | `TODO (1)` / `DOING (1)` / `DONE (1)`, ANSI 톤 노랑(#dcdcaa)/파랑(#6cb0e8)/초록(#89d185) |
| 카드 | 흰 둥근 카드, 날짜·계획 칩 | 얇은 보더 사각 박스, `#2f7` 짧은 id, 날짜 `09-15`, `@계획명` |
| 진행률 | 원형 링 | `[████░░░░░░░░]  33%  1/3` 텍스트 바 |
| 빈 상태/오류 | 이모지 문구 | `# …` 주석 문구, `error: …` |

- 진행률: `ProgressRing` 하나에서 바깥 `role="progressbar"` + `aria-valuenow/min/max` + `aria-label`을 공유한다. 링 SVG와 텍스트 바는 모두 시각용(텍스트 바는 `aria-hidden`)
- **짧은 id는 요청(“id 앞 3자리”)과 다르게 뒤 3자리로 표시했다.** MongoDB ObjectId의 앞부분은 생성 시각이라 카드끼리 거의 같다(예: 모두 `#6aa`). 뒤 3자리는 카드마다 구분된다(`#2f7`, `#2f8`, `#2f9`). 앞자리로 바꿔야 하면 `todo.id.slice(-3)` → `slice(0, 3)` 한 곳만 고치면 된다

**토글과 저장**
- `components/Header.tsx`의 버튼 하나
  - `aria-pressed`(개발자 테마 켜짐 = true). 보이는 이름은 "개발자 테마"로 고정하고 앞 장식(🖥️ / `[x]`)만 aria-hidden
  - 상태는 `<html data-theme>`를 `useSyncExternalStore` + `MutationObserver`로 읽는다(서버 스냅샷 false → hydration 불일치 없음)
  - 클릭 시 `data-theme` 변경 + `localStorage.theme` 저장(try/catch, 실패하면 이번 방문에만 적용)
- 깜빡임 방지: `app/layout.tsx`
  - `<html data-theme="colorful">`
  - `<head>`에 Next 16 가이드(`preventing-flash-before-hydration.md`의 Themes)와 같은 인라인 스크립트. 저장값이 `dev`/`colorful`일 때만 적용(다른 값은 무시)

**검증 (실제 실행, 3000 포트 dev 서버 그대로 사용, build 생략)**
| 항목 | 결과 |
| --- | --- |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 |
| `npx vitest run` | 2 files, 17 tests passed |

- 기본(컬러풀)
  - `/` 로드 시 `data-theme="colorful"`, 토글 `aria-pressed="false"`, 시스템 sans 폰트, 그라데이션 배경, 링 `aria-valuenow=33`. 앱 콘솔 에러 없음
  - 이 브라우저의 localhost:3000 localStorage에는 원래 다른 앱이 쓴 `theme=light`가 있었는데, 허용값이 아니라 무시되고 컬러풀로 표시됐다(허용값 필터 동작 확인)
- 토글 클릭 → `data-theme="dev"`, `localStorage.theme="dev"`, `aria-pressed="true"`, 모노 폰트, 배경 `rgb(24,24,24)`, 링 숨김 + 텍스트 바 `[████░░░░░░░░]  33%  1/3` 표시, 컬럼 헤더 `TODO (1)`/`DOING (1)`/`DONE (1)`
- **새로고침 후 유지**: 다시 로드해도 `data-theme="dev"`, `aria-pressed="true"`, 텍스트 바 표시
- **깜빡임 방지 근거**: 서버 HTML은 `data-theme="colorful"`로 오고, 테마 스크립트가 `<head>` 안에서 `<body>`보다 앞에 있다. 본문을 그리기 전에 실행되므로 저장된 테마가 첫 페인트부터 적용된다
  - 스타일시트 링크는 스크립트보다 앞이지만 렌더를 막고 속성 선택자로 적용되므로 영향 없음
  - 눈으로 보는 깜빡임을 프레임 단위로 측정하지는 않았다
- **스크린샷**
  - 두 테마 × `/`, `/weekly`, `/goals` × 데스크톱(약 1390~1430px)
  - 모바일 폭: `resize_window`가 적용되지 않아 400px iframe(viewport 396px)에 테마를 지정해 띄웠다. `/` 개발자·컬러풀, `/weekly` 개발자·컬러풀, `/goals` 개발자 스크린샷 확인. `/goals` 컬러풀은 화면 폭이 모자라 일부만 보였고 수치로 확인했다
  - 모바일 수치: 6개 조합 모두 `scrollWidth === innerWidth`(가로 스크롤 없음), 넘치는 요소 0개
    - 칸반 3컬럼: 두 테마 모두 1열(x16, w364, y 증가)
    - `/weekly`·`/goals` 카드: 1열(x16, w364)
- **대비(WCAG AA)**: 토큰 조합 대비비를 스크립트로 계산. 컬러풀 최소 5.72(danger/danger-soft), 개발자 최소 5.31(muted/surface-2). 본문 조합은 모두 4.5:1 이상
- 정리: `[e2e-check]` 할 일 3개·계획·목표 DELETE 모두 204, 세 컬렉션 0건. dev 서버는 종료하지 않았다(`GET /` 200). 확인하면서 바꾼 브라우저 localStorage `theme`는 원래 값 `light`로 되돌렸다

**개발자 테마 미검증**
- 개발자 테마에서 드래그 앤 드롭(키보드·포인터)과 원위치를 다시 해보지 않았다. 핸들은 같지만 카드 보더/radius 스타일이 다르다
- 할 일 수정 폼, 오류 상태, 빈 상태를 개발자 테마 화면에서 직접 띄워 보지 않았다(코드상 토큰만 적용)
- 토글을 키보드(Tab → Space)로 조작하는 것은 확인하지 않았다(네이티브 `button`이라 동작은 기대됨)
- 모바일 개발자 테마 입력창이 좁아 `$ todo add` 뒤 placeholder가 잘려 보인다(“무엇을 해야…”). 입력 기능에는 영향 없음

### 리디자인 후 미검증
- **드래그 앤 드롭 재확인 안 함**: 로직은 바꾸지 않았지만 핸들 마크업(SVG)과 카드 클래스가 바뀌었다. 키보드/포인터 드래그와 원위치를 브라우저에서 다시 해보지는 않았다 → QA E2E에서 확인 필요
- 색 대비: 이후 테마 토큰으로 옮기면서 조합별 대비비를 스크립트로 계산했다(컬러풀 최소 5.72, 위 "개발자 테마" 참고). 브라우저 접근성 도구로 화면을 직접 재지는 않았다
- 실제 모바일 기기/터치, 스크린리더 낭독(진행률 링 읽기) 미검증
- 모바일 스크린샷에서 Next dev 인디케이터("N" 버튼)가 링 일부를 가린다. 개발 모드에서만 보이는 오버레이라 앱 문제는 아니다
