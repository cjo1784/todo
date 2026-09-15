# 03-frontend-report — GitHub OAuth 로그인 (T04 Frontend)

기준: `artifacts/00-input.md` 계약. 새 의존성 없음, git 명령·백엔드/테스트 파일 수정 없음.

## 1. 만든/수정한 파일
| 파일 | 내용 |
| --- | --- |
| `app/login/page.tsx` (신규) | 서버 컴포넌트. `PageProps<"/login">`의 `searchParams`(Promise)에서 `error` 읽어 안내. "GitHub로 로그인" = `<a href="/auth/github">` |
| `components/Header.tsx` | `/api/me` 조회 → 아바타(`next/image` 28px, `alt=username`) + username + 로그아웃 `<form method="post" action="/auth/logout">`. `/login`에서는 내비·사용자 영역 숨김(테마 토글 유지). 사용자 영역과 토글을 한 `ml-auto` 묶음으로 배치 |
| `lib/client.ts` | `api()`가 401이면 현재 경로가 `/login`이 아닐 때 `window.location.assign("/login")` 후 기존대로 `ApiError` throw. `CODE_TEXT.UNAUTHORIZED` 추가. 204·에러 메시지·훅 동작 불변 |
| `next.config.ts` | `images.remotePatterns: [{ protocol: "https", hostname: "avatars.githubusercontent.com", pathname: "/u/**" }]`. GitHub `avatar_url`에 `?v=4`가 붙어 `search`는 생략(쿼리 허용) |

칸반·주간·목표 화면 파일은 건드리지 않았다.

## 2. 화면별 동작
### `/login`
- `?error=` 문구(`role="alert"`)
  - `state` → 보안 확인에 실패했습니다. 다시 시도해 주세요.
  - `oauth` → GitHub 인증에 실패했습니다. 잠시 후 다시 시도해 주세요.
  - `config` → 서버에 GitHub OAuth 설정이 없습니다. `docs/AUTH_SETUP.md`를 참고해 환경 변수를 설정해 주세요.
  - `denied` → 로그인을 취소했습니다.
  - 그 외 값 → 알 수 없는 오류가 발생했습니다. 다시 시도해 주세요.
  - 파라미터 없음 → 안내 없음
- 로그인 버튼은 라우트 핸들러 리다이렉트라 `next/link`가 아닌 일반 `<a>`(전체 페이지 이동)

### 헤더
- `/api/me` 상태: 조회 중 = 28px 아바타 자리 표시(흔들림 최소화) / 200 = 아바타·이름·로그아웃 / 401·실패 = 사용자 영역 없음
- `/api/me`는 `api()` 대신 `fetch` 직접 사용. `api()`의 401 리다이렉트를 헤더에서 일으키지 않기 위함(화면 리다이렉트는 `proxy.ts` 담당). AbortController로 언마운트 시 취소
- 로그아웃은 JS 없이 동작하는 네이티브 POST 폼

## 3. 두 테마 처리 (시맨틱 토큰·`dev:` 변형만 사용, 하드코딩 색 없음)
| 위치 | 컬러풀 | 개발자 |
| --- | --- | --- |
| 로그인 제목 | ✅ 할 일 관리 (흰 카드 중앙 박스) | `$ gh auth login` (얇은 보더 사각 박스) |
| 설명 | GitHub 계정으로 로그인하고… | `# GitHub 계정으로 로그인해야 합니다` |
| 오류 | 연분홍 박스 | `error: …` 접두 |
| 버튼 | GitHub 아이콘 + GitHub로 로그인 | `❯ GitHub로 로그인` |
| 헤더 사용자 | 아바타 · username · 로그아웃 | 아바타 · `@username` · `logout` |

장식 문자(✅, `$`, `❯`, `@`)는 `aria-hidden`. 테마별 문구는 기존 `Themed` 헬퍼 사용.

## 4. 계약 사용 방식
- `GET /api/me` → 200 `{ id, username, avatarUrl }`만 사용(`id`는 표시 안 함) / 그 외 상태는 "사용자 없음"
- `POST /auth/logout` → 폼 제출, 303 `/login` 응답을 브라우저가 따라감
- `GET /auth/github` → `<a href>` 전체 이동
- 모든 `/api/**` 401 → `api()`가 `/login`으로 이동

## 5. 검증 (실제 실행, 3000 포트 dev 서버 그대로 사용, build 생략)
| 명령 | 결과 |
| --- | --- |
| `npx tsc --noEmit` | 최종 exit 0. 중간 실행 1회에서 `tests/api.test.ts` 2건(TS2554) 에러가 났는데 Backend 담당 파일 작업 중이던 시점이며, 내 파일 에러는 0건. 재실행 시 exit 0 |
| `npm run lint` | exit 0 (경고 0). `lib/client.ts`의 `@next/next/no-location-assign-relative-destination` 경고는 사유 주석과 함께 해당 줄만 disable — 컴포넌트 밖 fetch 래퍼라 `useRouter` 불가, 세션 상태를 다시 읽는 전체 이동이 의도 |

### `/login` (Backend 준비 전·후 모두 확인)
- curl: `?error=state|oauth|config|denied|zzz` 모두 200, 각 문구가 서버 HTML의 `role="alert"`에 포함. 파라미터 없음 → alert 0개, `href="/auth/github"` 존재, 내비 없음
- 브라우저 데스크톱(1440px): 컬러풀·개발자 `?error=config` 스크린샷 확인. 개발자 테마: 모노 폰트, 배경 `rgb(24,24,24)`, 제목 `$ gh auth login`, 알림 `error: …`
- 브라우저 모바일(400px iframe): 2테마 × `state/oauth/denied/zzz` 8조합 모두 문구 일치, `scrollWidth === innerWidth`(400), 내비 없음. 스크린샷으로 레이아웃 확인

### 로그인 상태 헤더 (Backend 준비 후 테스트 세션으로 확인)
- Atlas `todo` DB에 `[e2e-check]` 사용자 + 세션(`lib/auth.ts`와 같은 sha256 해시, 만료 1시간) 삽입 → `curl -H "Cookie: session=…" /api/me` 200 JSON, `/` 200
- 브라우저 `/` 데스크톱(컬러풀): 아바타 `alt="[e2e-check]"` 28×28, `/_next/image` 200 image/png로 로드(natural 32px), 이름·로그아웃 표시, 내비 표시, 가로 스크롤 없음. 확대 스크린샷 확인
  - `next.config.ts` 변경은 dev 서버 재시작 없이 반영됨(`/_next/image?url=avatars…` 200)
- 모바일 400px: 컬러풀 헤더 2줄(107px) / 개발자 3줄(185px, 모노 폰트가 넓어 토글이 한 줄 아래로), 두 테마 모두 가로 넘침 없음
  - 처음엔 사용자 영역과 토글이 따로 줄바꿈돼 흩어져서, 한 묶음(`ml-auto flex-wrap justify-end`)으로 고친 뒤 재확인
- 로그아웃: 헤더 버튼 클릭(네이티브 POST) → `/login` 도착, 내비·로그아웃 폼 없음, `/api/me` 401, DB 세션 문서 1 → 0
- `api()` 401 리다이렉트: 무효 `session` 쿠키로 `/` 로드 → `proxy.ts` 통과 → 목록 API 401 → `/login` 이동(방문 경로 `/` → `/login`), 헤더 사용자 영역 없음
- 앱 콘솔 에러 없음(확인된 에러는 모두 브라우저 확장 `chrome-extension://…`)

### 정리
- 테스트 사용자·세션 삭제: `users` 1건 삭제, `sessions`/`todos`/`weeklyplans`/`yeargoals` 해당 userId 0건, `[e2e-check]` 사용자 잔여 0
- 임시 스크립트·토큰 파일 삭제, 테스트 쿠키 만료 처리, 브라우저 탭 닫음. localStorage `theme`는 바꾸지 않음(원래 `colorful`). dev 서버는 종료·재시작하지 않음

## 6. 미검증
- 실제 GitHub OAuth 왕복(`/auth/github` → GitHub → 콜백 → 헤더): `GITHUB_CLIENT_ID/SECRET` 입력 후 가능. 실제 GitHub 아바타 URL 형식이 `/u/**`가 아니면 이미지가 400 → 그 경우 `pathname`을 넓혀야 함
- 테스트 쿠키는 JS로 넣어 httpOnly가 아니었다(서버 동작엔 영향 없음)
- 헤더 로딩 자리표시가 실제로 흔들림을 얼마나 줄이는지 프레임 단위 측정 안 함
- 개발자 테마 로그인 상태 데스크톱 스크린샷은 찍지 않음(모바일 iframe으로만 확인)
- 스크린리더 낭독, 실제 모바일 기기, 키보드 Tab 순서 직접 조작 미확인(모두 네이티브 `a`/`button`이라 기대됨)

## 7. 계약 이슈
- 없음. `/api/me` 401 본문 `{ error: { code: "UNAUTHORIZED", message: "Login required", details: null } }`, `POST /auth/logout` 303 `/login`, 미로그인 `/` 307 `/login` 모두 계약과 일치
- 참고: `proxy.ts`는 쿠키 존재만 보므로 만료·무효 쿠키 사용자는 화면에 들어온 뒤 API 401로 `/login`에 간다. 이 경로는 `lib/client.ts`의 401 처리로 커버됨(위에서 확인)

## 8. QA 재작업 (D5)
- 문제: `/api/me`가 401이 아닌 이유(500·네트워크·JSON 파싱 실패)로 실패하면 헤더에서 로그아웃 버튼까지 사라져 로그아웃할 방법이 없음
- 수정: `components/Header.tsx`만 변경
  - `me` 상태: `undefined`(조회 중) / `null`(401 → 사용자 영역 없음) / `"error"`(그 외 실패) / `Me`
  - 아바타·username은 `Me`일 때만, 로그아웃 폼(`POST /auth/logout`)은 `Me` 또는 `"error"`일 때 표시
  - 두 테마 문구(`로그아웃` / `logout`)·스타일 그대로
- 검증: `npx tsc --noEmit` exit 0, `npm run lint` exit 0
  - 수정 중 `.then` 반환 타입 추론 에러(TS2345)가 2회 나서 `async` 콜백으로 바꾼 뒤 통과
- 미검증: 브라우저에서 `/api/me` 500·네트워크 실패를 실제로 만들어 버튼 표시를 확인하지는 않음(Backend 파일을 바꾸지 않고는 500 재현이 어려움). 401·200 경로 코드는 조건만 분리했고 동작은 이전과 같음
- D6(401 이동 직전 오류 문구 잠깐 표시)은 지시대로 이번 범위에서 제외
