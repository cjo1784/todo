# GitHub 로그인 설정

## 1. GitHub OAuth App 만들기
1. GitHub → **Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App**
2. 입력값 (로컬 개발)
   | 항목 | 값 |
   | --- | --- |
   | Application name | 자유 (예: `todo-local`) |
   | Homepage URL | `http://localhost:3000` |
   | Authorization callback URL | `http://localhost:3000/auth/github/callback` |
3. **Register application** → **Client ID** 확인 → **Generate a new client secret**으로 Secret 발급 (Secret은 이때 한 번만 보인다)

## 2. 환경 변수
`.env.local`에 넣는다 (`.env.example` 참고).

> ⚠️ **`.env.example`에는 실제 값을 넣지 않는다.** `.env.example`은 git에 올라가는 템플릿이다(`.gitignore`의 `!.env.example`). 실제 값은 항상 `.env.local`에만 넣는다.

```
GITHUB_CLIENT_ID=<Client ID>
GITHUB_CLIENT_SECRET=<Client secret>
APP_URL=http://localhost:3000
```

- **Client Secret은 절대 커밋하지 않는다.** `.env.local`은 `.gitignore`의 `.env*`로 무시된다. 채팅·이슈·스크린샷에도 붙여넣지 않는다. 노출됐다면 GitHub에서 즉시 재발급한다.
- 값을 넣거나 바꾼 뒤에는 **dev 서버를 재시작**해야 반영된다 (`npm run dev`).
- `models/*` 스키마를 바꾼 뒤에도 **dev 서버를 재시작**한다. 핫 리로드 중에는 이전 Mongoose 스키마가 남아 새 필드(예: `userId`)가 조용히 저장되지 않을 수 있다.
- 값이 비어 있으면 `/auth/github`가 `/login?error=config`로 돌아간다.
- ⚠️ E2E(`npx playwright test`)는 `.env.local`의 **실제 DB**에 `[e2e-check]` 표시 데이터를 쓰고, 끝나면 지운다. 운영 데이터가 있는 DB를 가리키고 있다면 실행 전에 확인한다.

## 3. 배포할 때
- `APP_URL`을 배포 주소(예: `https://todo.example.com`, 끝에 `/` 없음)로 바꾼다.
- OAuth App의 Homepage URL과 Authorization callback URL(`<APP_URL>/auth/github/callback`)도 같은 주소로 바꾼다. 로컬용과 배포용 OAuth App을 따로 만드는 편이 안전하다.
- production에서는 세션 쿠키에 `Secure`가 붙으므로 HTTPS가 필요하다.
- 로그인·로그아웃 후 리다이렉트 주소(`/`, `/login`)는 `APP_URL`이 아니라 요청 URL(`req.url`, 즉 Host 헤더) 기준으로 만든다. 리버스 프록시·CDN 뒤에서는 원래 Host가 전달되는지 확인한다.

## 4. 기존 데이터 마이그레이션 (`userId` 할당)
로그인 기능 이전에 만든 할 일·주간 계획·1년 목표에는 `userId`가 없어 어느 계정에서도 보이지 않는다. 한 번 실행해 소유자를 지정한다.

1. 데이터를 가져갈 GitHub 계정으로 **한 번 로그인**한다 (users 컬렉션에 사용자가 생겨야 함).
2. 미리보기 (변경 없음, 대상 건수만 출력)
   ```
   node --env-file=.env.local scripts/migrate-add-user-id.ts --user <githubUsername> --dry-run
   ```
3. 실행
   ```
   node --env-file=.env.local scripts/migrate-add-user-id.ts --user <githubUsername>
   ```
   - 컬렉션별(`todos`, `weeklyplans`, `yeargoals`) 할당 건수를 출력하고 `userId` 인덱스를 만든다.
   - `userId`가 이미 있는 문서는 건드리지 않으므로 여러 번 실행해도 결과가 같다.
   - 사용자가 없으면 에러로 종료한다(exit 1).
   - Node 25 이상 필요. `MODULE_TYPELESS_PACKAGE_JSON` 경고는 무시해도 된다.

## 에러 코드 (`/login?error=`)
| 값 | 의미 |
| --- | --- |
| `config` | `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`/`APP_URL` 미설정 |
| `denied` | GitHub 화면에서 사용자가 승인 거부 |
| `state` | state 불일치(만료·위조·다른 탭). 다시 로그인 |
| `oauth` | 토큰 교환·사용자 조회 실패 (Secret 오류, callback URL 불일치 등) |
