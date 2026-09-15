# 00-input — 캘린더 화면

- 이전 실행(GitHub OAuth 로그인) 산출물: `artifacts/archive/20260915-142949/`
- 기준 커밋: `0ce16ad` (main, 푸시 완료) / 작업 브랜치: `feat/calendar`
- 요청: "이거 제대로 쓸꺼면 캘린더 형식으로 하면 좋을꺼같은데" (2026-09-15)

## 결정 (사용자 선택)
| 항목 | 결정 |
| --- | --- |
| 위치 | 칸반 옆 새 화면 `/calendar`, 기존 화면 유지 |
| 보기 | 월간 + 주간 전환, 월요일 시작, 주간 보기에 주간 계획·진행률 |
| 조작 | 날짜 칸 클릭 → 추가 / 드래그로 날짜 이동 / 할 일 클릭 → 상태·수정·삭제 / 날짜 없는 할 일 목록에서 끌어 배정 |

## 오케스트레이터 판단
| 항목 | 결정 | 근거 |
| --- | --- | --- |
| 백엔드 | 변경 없음 → Backend 단계 생략 | 기존 `GET /api/todos`(본인 전체)·`PATCH {date}`·`date: null`로 충분 |
| 데이터 | 전체 조회 후 클라이언트에서 날짜별 그룹 | 1인 사용 규모. 범위 조회 API는 느려질 때 추가 |
| 드래그 | 기존 dnd-kit, 실패 시 원위치(칸반과 동일), 키보드 조작 가능 | 새 의존성 금지 |
| 날짜 계산 | `YYYY-MM-DD` 문자열 + UTC 순수 함수(`lib/calendar.ts`) + 단위 테스트 | 시간대 오차 방지 |
| 상태 | URL `?view=month\|week&date=` | 새로고침 유지 |

## 계약 (기존, 변경 없음)
- `GET /api/todos` → 본인 할 일 전체 `{ id, title, date: "YYYY-MM-DD"|null, status, weeklyPlanId }[]`
- `PATCH /api/todos/[id]` `{ date }` / `{ status }` / `{ date: null }`
- `POST /api/todos` `{ title, date?, weeklyPlanId? }`, `DELETE` 204
- `GET /api/weekly-plans` → 진행률 포함

## 팀
- PM: PRD에 캘린더 항목 추가(오케스트레이터 반영) / Backend: 생략 / AI 연동: 생략
- Frontend: 구현 / QA: 구현 후 검증

## 승인 지점
- main 병합·푸시 (QA 후)
