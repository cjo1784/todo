# final-summary — GitHub OAuth 로그인

- 요구: `docs/LOGIN.md` / 결정·계약: `artifacts/00-input.md`
- 브랜치 `feat/github-oauth` → main 병합 (사용자 승인: "main에 바로 푸시", 2026-09-15)

## 사용 가능
| 완료 조건 | 근거 |
| --- | --- |
| OAuth App 설정 가이드·.env.example | `docs/AUTH_SETUP.md`, `.env.example`(비밀 키 빈 값) |
| /auth/github, /auth/github/callback | Vitest(state·denied·oauth·정상·타임아웃), curl 302 GitHub authorize, 실제 GitHub 로그인 성공 |
| username·avatar_url 저장 | Vitest upsert, 실제 로그인 users 1건 |
| 미로그인 차단 | curl `/api/**` 401, 화면 307 `/login`, E2E |
| 본인 데이터만 (할 일·주간 계획·1년 목표) | Vitest IDOR·진행률 소유자 조건, E2E 사용자 B |
| 로그아웃 시 세션 삭제 (현재 기기) | Vitest·curl·E2E 세션 0건, 다른 Origin 403 |
| userId 필드 + 마이그레이션 | 3모델 required+index, `scripts/migrate-add-user-id.ts` Vitest(멱등·dry-run) |
| 금지사항 | CRUD diff는 소유자 조건만(QA·리뷰어 줄 단위 검토), 시크릿 하드코딩 0건 |

- 검증: tsc 0, lint 0, Vitest 43/43, Playwright 7/7 (QA 최종, 정리 패스 직전) / 정리 패스 후 tsc·lint·Vitest 43/43
- QA 최종 **통과**, 리뷰어(architect) **APPROVED WITH SUGGESTIONS** → Low 3건 반영

## 사람 승인 필요 / 사용자 확인
- 실제 계정으로 로그아웃 후 sessions 0건 확인
- 대화 기록에 노출된 GitHub client secret 재발급, Atlas DB 비밀번호 변경 권장

## 미검증 영역
- 정리 패스(`getSessionUser` export 제거) 이후 Playwright·`npm run build` 재실행 안 함 (사용자 중단)
- production 모드, 마이그레이션 CLI 실제 데이터 실행, 스크린리더·실기기
- 레이트 리밋 없음, 배포 시 리다이렉트 기준(`req.url` Host), `APP_URL`과 다른 주소 접속 시 로그아웃 403
- D6(401 이동 직전 오류 문구 잠깐 표시, 낮음) 범위 제외
