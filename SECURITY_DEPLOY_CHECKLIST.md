# 정참시 SECURITY DEPLOY CHECKLIST · v2.5.1

코드 배포 후 운영자가 직접 확인해야 하는 보안 설정입니다.

## 1. Vercel Environment Variables
Production 환경에서 아래 값을 각각 서로 다른 긴 랜덤 값으로 설정합니다.

- `ADMIN_SESSION_SECRET` — 32자 이상 권장
- `ADMIN_MFA_ENCRYPTION_KEY` — 별도의 긴 랜덤 키 권장
- `USER_SESSION_SECRET` — 32자 이상 권장
- `USER_DATA_ENCRYPTION_KEY` — 별도의 긴 랜덤 키 권장
- `CRON_SECRET` — 24자 이상 권장
- `ADMIN_PASSWORD` — Redis에 커스텀 비밀번호가 아직 저장되지 않은 초기 운영용. 관리자 보안 화면에서 12자 이상의 새 비밀번호로 변경 후 운영합니다.

키 값을 GitHub 코드나 README에 직접 기록하지 않습니다.

## 2. 관리자 MFA 활성화
배포 후 `/admin` → `관리자 보안`에서 다음 순서로 설정합니다.

1. 현재 관리자 비밀번호 입력
2. `MFA 설정 시작`
3. Google Authenticator 등 TOTP 앱에 표시된 Secret 등록
4. 앱의 6자리 코드로 활성화 확정
5. 화면에 한 번만 표시되는 복구코드 8개를 별도 보관
6. 다시 로그인해 비밀번호 + MFA 두 단계를 모두 확인

## 3. Vercel Firewall / WAF
코드의 Redis rate limit과 별도로 Vercel Dashboard → Project → Firewall에서 앞단 rate limit을 설정합니다.

### 우선 추천 규칙
- 경로: `/api/admin/login`
- 기준: IP 또는 JA4 Digest
- 시작값 예시: 10분 동안 10~15회
- 처음에는 `Log`로 관찰 후 `Rate Limit (429)` 또는 `Challenge`로 전환

프로젝트 트래픽이 안정되면 `/api/account/login`도 별도 규칙을 검토합니다.

## 4. 배포 직후 확인
- 이전 관리자 로그인 쿠키가 자동 폐기되고 다시 로그인되는지
- MFA 활성화 후 비밀번호만으로 관리자 로그인이 끝나지 않는지
- 복구코드 1개를 사용하면 재사용되지 않는지
- 관리자 페이지 45분 비활동 후 다시 로그인이 필요한지
- 비밀번호 변경 후 다른 브라우저의 관리자 세션도 무효화되는지
- 회원 로그인 연속 시도에 429 제한이 적용되는지
- 외부 출처에서 보내는 POST 요청이 403으로 거부되는지

## 5. 정기 운영
- 관리자 보안 화면의 감사로그를 주기적으로 확인
- 의심스러운 로그인 발생 시 `모든 관리자 세션 종료` 실행
- 복구코드가 부족하거나 노출 가능성이 있으면 즉시 재발급
- 운영자 기기 분실 시 관리자 비밀번호 변경 + 모든 세션 종료
