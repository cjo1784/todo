# artifacts 지도 — GitHub OAuth 로그인

| 파일 | 역할 | 만든 팀원 | 다음에 읽는 팀원 | 상태 | 승인 상태 |
| --- | --- | --- | --- | --- | --- |
| `00-input.md` | 요청·결정·계약 | Orchestrator | 전원 | current | 해당 없음 |
| `../docs/PRD.md` | PRD (로그인 항목 추가) | Orchestrator(요구 반영) | Backend, Frontend, QA | current | 사용 가능 |
| `02-backend-report.md` | 인증·격리·마이그레이션 보고 | Backend | Frontend, QA | current | 미검증 영역 있음 (실제 GitHub OAuth 왕복, 레이트 리밋 없음) |
| `03-frontend-report.md` | 로그인 화면·헤더 보고 | Frontend | QA | current | 미검증 영역 있음 (실제 GitHub OAuth 왕복) |
| `05-qa-report.md` | 테스트·리뷰 | QA | Orchestrator | current (최종 통과, Vitest 43/43·E2E 7/7) | 사용 가능 |
| 리뷰어(architect) | 완료 조건 대조·보안 리뷰 | Orchestrator 위임 | Orchestrator | 완료 | APPROVED WITH SUGGESTIONS → Low 3건 반영 |
| `final-summary.md` | 최종 통합 | Orchestrator | 사용자 | current | 미검증 영역 있음 (정리 후 build·E2E 미재실행, 로그아웃 실사용 확인 대기) |
| `archive/20260915-121722/` | 이전 실행(P0 + UI 테마) | - | 참고용 | archived | - |

- T04-AI연동: 요구 없음 → 생략
- Backend·Frontend는 `00-input.md` 계약 기준 병렬 진행
