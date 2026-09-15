# 할 일 관리 앱 PLAN

- 상태: **approved** (2026-09-15, 팀 진행)
- 기준 문서: [PRD.md](./PRD.md)
- 범위: P0 완료 → P1

## 1. 결정 사항
| 항목 | 결정 | 근거 |
| --- | --- | --- |
| 앱 형태 | 웹앱 + 서버 DB | 사용자 선택 |
| 사용자 | 로그인 없음, 단일 사용자 | 사용자 선택, PRD에 인증 요구 없음 |
| 프레임워크 | Next.js (App Router) + TypeScript | 사용자 선택 |
| DB | MongoDB + Mongoose | 사용자 선택 / 스키마 검증은 Mongoose로 처리 |
| API | Next.js Route Handlers (`app/api/**`) | 백엔드·프론트 역할 분리 가능 |
| 드래그 앤 드롭 | dnd-kit | 키보드·터치 접근성 기본 지원 |
| 스타일 | Tailwind CSS | create-next-app 기본값 |
| 테스트 | Vitest (단위·통합, mongodb-memory-server) / Playwright (E2E) | |

## 2. 가정 (변경 시 알려주기)
- 주 시작: 월요일. `weekStart`는 해당 주 월요일 날짜
- 날짜 저장: `YYYY-MM-DD` 문자열 (시간대 오차 방지)
- 주간 진행률: DB에 저장하지 않고 조회 시 계산 → 항상 최신값
- P0 상위 항목 삭제: 하위 항목 연결만 해제 (`null`). 선택 기능은 P1
- 칸반 컬럼 내 순서 변경: PRD에 없음 → 제외

## 3. 데이터 모델
- `YearGoal`: `_id`, `title`(필수), `year`(필수, 정수)
- `WeeklyPlan`: `_id`, `title`(필수), `weekStart`(필수), `yearGoalId`(nullable)
- `Todo`: `_id`, `title`(필수), `date`, `status`(`todo`|`doing`|`done`, 기본 `todo`), `weeklyPlanId`(nullable)

## 4. API
| Method | 경로 | 설명 |
| --- | --- | --- |
| GET / POST | `/api/todos` | 목록(`?date=`, `?weeklyPlanId=`) / 생성 |
| PATCH / DELETE | `/api/todos/[id]` | 수정(상태·연결 포함) / 삭제 |
| GET / POST | `/api/weekly-plans` | 목록(진행률 포함) / 생성 |
| PATCH / DELETE | `/api/weekly-plans/[id]` | 수정·연결 / 삭제(하위 할 일 연결 해제) |
| GET / POST | `/api/year-goals` | 목록 / 생성 |
| PATCH / DELETE | `/api/year-goals/[id]` | 수정 / 삭제(하위 주간 계획 연결 해제) |

- 공통 에러: 잘못된 입력·ObjectId → `400`, 없는 id → `404`, 존재하지 않는 상위 항목 연결 → `400`

## 5. 파일 구조 (예정)
```
todo/
├── app/
│   ├── page.tsx                 # 칸반 보드 + 일일 목록
│   ├── weekly/page.tsx          # 주간 계획 + 진행률
│   ├── goals/page.tsx           # 1년 목표
│   └── api/
│       ├── todos/route.ts, [id]/route.ts
│       ├── weekly-plans/route.ts, [id]/route.ts
│       └── year-goals/route.ts, [id]/route.ts
├── components/                  # KanbanBoard, TodoCard, TodoForm 등
├── lib/
│   ├── db.ts                    # Mongoose 연결 (개발 모드 재연결 방지 캐시)
│   └── progress.ts              # 진행률 계산
├── models/                      # Todo.ts, WeeklyPlan.ts, YearGoal.ts
├── tests/                       # Vitest / Playwright
└── .env.local                   # MONGODB_URI
```

## 6. 마일스톤

### M1. 기반
- [x] MongoDB 위치 결정 (로컬 / Docker / Atlas) → Atlas
- [x] create-next-app (TypeScript, Tailwind, App Router)
- [ ] 의존성: mongoose, @dnd-kit/core, vitest, mongodb-memory-server, playwright (mongoose·vitest·mongodb-memory-server·@dnd-kit/core 완료 / playwright는 M4에서 설치)
- [x] `lib/db.ts`, `.env.local` (`MONGODB_URI`)
- [x] `models/` 3종

**완료 기준**
- `npm run dev` 실행 후 DB 연결 에러 없음
- 필수 필드 없이 저장 시 Mongoose 검증 에러 발생

### M2. 백엔드 API (P0)
- [x] 할 일 API
- [x] 주간 계획 API
- [x] 1년 목표 API
- [x] 상위 항목 삭제 시 하위 연결 해제
- [x] `lib/progress.ts` + 주간 계획 목록에 진행률 포함

**완료 기준**
- `POST /api/todos` `{title}` → `201`, `status: "todo"`
- `PATCH /api/todos/[id]` `{status: "invalid"}` → `400`
- 없는 id 조회·수정·삭제 → `404`
- 주간 계획 삭제 후 연결됐던 할 일의 `weeklyPlanId === null`
- 할 일 4개 중 `done` 1개 → 진행률 `25`
- 연결된 할 일 0개 → 진행률 `0`

### M3. 프론트엔드 (P0)
- [x] 칸반 보드 (todo/doing/done 3컬럼)
- [x] 할 일 생성·수정·삭제 폼
- [x] 드래그 앤 드롭 → `PATCH` 호출, 화면 먼저 반영 후 실패 시 원위치 + 에러 표시
- [x] 주간 계획 화면: CRUD, 1년 목표 연결, 진행률 표시
- [x] 1년 목표 화면: CRUD
- [x] 할 일 폼에서 주간 계획 연결/해제

**완료 기준**
- 카드를 `doing`으로 옮기고 새로고침해도 `doing` 유지
- API 실패 시 카드 원위치
- 할 일 상태 변경·생성·삭제 후 새로고침 없이 주간 진행률 갱신
- 키보드만으로 카드 상태 변경 가능

### M4. QA (P0)
- [ ] 단위: `lib/progress.ts` (0개, 전부 done, 일부 done)
- [ ] 통합: API 전체 (정상·400·404·연결 해제)
- [ ] E2E: 할 일 생성 → 드래그로 `done` → 진행률 변화 확인
- [ ] PRD P0 항목 전체 대조

**완료 기준**
- `npx vitest run` 전부 통과
- `npx playwright test` 전부 통과
- PRD P0 항목 누락 0개

### M5. 추가 기능 (P1)
- [ ] 1년 목표 진행률 (연결된 주간 계획 진행률 평균)
- [ ] 기간별 필터 (일/주/연도)
- [ ] 목표 → 주간 계획 → 할 일 계층 뷰
- [ ] 상위 항목 삭제 시 처리 선택 (연결 해제 / 함께 삭제)

## 7. 리스크
| 리스크 | 대응 |
| --- | --- |
| MongoDB 실행 환경 미정 | M1 첫 작업으로 결정, `MONGODB_URI`만 바꾸면 전환 가능 |
| 개발 모드 핫 리로드 시 DB 연결 누적 | `lib/db.ts`에서 전역 캐시로 연결 재사용 |
| 날짜·주 경계 시간대 오차 | `YYYY-MM-DD` 문자열 저장, 월요일 기준 계산 함수 하나로 통일 |
| 진행률 값 불일치 | 저장하지 않고 조회 시 계산 |
| 드래그 후 저장 실패 | 원위치 + 에러 표시 |
| 존재하지 않는 상위 항목 연결 | API에서 존재 확인 후 `400` |

## 8. 검증 절차
1. `npm run build` 성공
2. `npx vitest run` 통과
3. `npx playwright test` 통과
4. 수동 확인: 목표 생성 → 주간 계획 연결 → 할 일 연결 → 드래그 → 진행률 변화
5. PRD P0 체크리스트 대조
