# 🎙️ AI Dubbing Service

오디오 · 비디오 파일을 원하는 언어로 자동 더빙해주는 AI 기반 웹 서비스입니다.

**배포 URL:** https://ai-dubbing-seven.vercel.app

<video src="https://github.com/user-attachments/assets/56e1420d-1096-4273-bdd7-d9ce65f05152" controls width="100%"></video>

---

## 1. 서비스 소개 및 주요 기능

### 서비스 소개

파일 하나를 업로드하면 **음성 인식 → AI 번역 → 음성 합성** 파이프라인을 통해 원하는 언어의 더빙 결과물을 즉시 확인하고 다운로드할 수 있습니다. 비디오 파일 입력 시에는 더빙 오디오가 합쳐진 영상이 출력되며, 번역 자막이 함께 표시됩니다.

### 더빙 파이프라인

```
오디오/비디오 파일 업로드
        ↓
[Step 1] ElevenLabs STT (scribe_v1)
         음성 → 텍스트 추출 (타임스탬프 포함)
        ↓
[Step 2] OpenAI GPT-4o-mini
         원문 → 목표 언어 번역
        ↓
[Step 3] ElevenLabs TTS (eleven_multilingual_v2)
         번역문 → 더빙 음성 생성
        ↓
MP3/영상 다운로드 + 번역 자막 표시
```

### 주요 기능

| 기능 | 설명 |
|------|------|
| **AI 더빙** | 오디오·비디오 파일을 7개 언어로 자동 더빙 |
| **지원 언어** | 한국어, 영어, 일본어, 중국어, 스페인어, 프랑스어, 독일어 |
| **더빙 영상 출력** | 비디오 파일 입력 시 더빙 오디오가 합쳐진 영상 출력 (ffmpeg.wasm, 브라우저 처리) |
| **번역 자막** | 타임스탬프 기반 번역 자막 — 영상은 오버레이 표시(토글 지원), 오디오는 플레이어 하단 표시 |
| **파일 다운로드** | 더빙된 MP4 or MP3 직접 다운로드 버튼 제공 |
| **회원 관리** | Google OAuth + 화이트리스트 기반 접근 제어 |
| **결과 확인** | 원문 텍스트, 번역문, 오디오 플레이어 제공 |
| **대용량 파일 지원** | Vercel Blob을 통한 최대 50MB 파일 업로드 |

### 접근 제어

- Google 계정으로 로그인
- Turso DB의 허용 목록에 등록된 이메일만 서비스 이용 가능
- 미등록 계정은 `/unauthorized` 안내 페이지로 차단

---

## 2. 기술 스택

### Frontend
| 기술 | 버전 | 용도 |
|------|------|------|
| Next.js | 16.2.1 | 풀스택 프레임워크 (App Router) |
| React | 19.2.4 | UI 라이브러리 |
| TypeScript | 5 | 타입 안정성 |
| Tailwind CSS | 4 | 스타일링 |
| ffmpeg.wasm | - | 브라우저에서 영상 + 오디오 합성 |

### Backend / API
| 기술 | 버전 | 용도 |
|------|------|------|
| Next.js API Routes | - | 서버리스 API 엔드포인트 |
| NextAuth | 5.0.0-beta.30 | 인증 (Google OAuth) |
| Drizzle ORM | 0.45.1 | 데이터베이스 쿼리 |

### 외부 서비스
| 서비스 | 용도 |
|--------|------|
| ElevenLabs API | STT (scribe_v1) + TTS (eleven_multilingual_v2) |
| OpenAI API | GPT-4o-mini 번역 |
| Turso (libSQL) | 서버리스 SQLite DB (허용 사용자 관리) |
| Vercel | 배포 및 호스팅 |
| Vercel Blob | 대용량 파일 스토리지 (최대 50MB) |
| Google OAuth | 소셜 로그인 |

---

## 3. 로컬 실행 방법

### 사전 요구사항

- Node.js 18 이상
- 아래 외부 서비스 계정 및 API 키 필요:
  - Google Cloud Console (OAuth 앱)
  - OpenAI Platform
  - ElevenLabs
  - Turso

### 설치 및 실행

```bash
# 1. 저장소 클론
git clone https://github.com/jin-wook-lee-96/ai-dubbing.git
cd ai-dubbing

# 2. 패키지 설치
npm install

# 3. 환경 변수 설정 (.env.local 파일 생성)
# 아래 환경 변수 섹션 참고

# 4. 개발 서버 실행
npm run dev
# → http://localhost:3000
```

### 환경 변수 설정 (`.env.local`)

```env
# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# NextAuth
NEXTAUTH_SECRET=your_random_secret_string
NEXTAUTH_URL=http://localhost:3000

# ElevenLabs
ELEVENLABS_API_KEY=your_elevenlabs_api_key

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Turso
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your_turso_auth_token

# Vercel Blob (대용량 파일 업로드)
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token

# 초기 허용 이메일 목록 (DB 초기화 시 자동 등록, 쉼표로 구분)
INITIAL_ALLOWED_EMAILS=email1@example.com,email2@example.com
```

### 데이터베이스 초기화

로컬 서버 실행 후 아래 엔드포인트를 1회 호출하면 테이블 생성 및 허용 이메일이 등록됩니다:

```bash
curl http://localhost:3000/api/db-init
# → {"success":true,"message":"DB initialized"}
```

허용 사용자 이메일은 `.env.local`의 `INITIAL_ALLOWED_EMAILS` 환경변수로 설정합니다 (쉼표로 구분, 예: `email1@example.com,email2@example.com`). `/api/db-init` 호출은 인증된 세션이 있어야 합니다.

### 빌드 및 기타 명령어

```bash
npm run build    # 프로덕션 빌드
npm start        # 프로덕션 서버 실행
npm run lint     # ESLint 검사
```

---

## 4. 배포된 서비스 URL

| 항목 | URL |
|------|-----|
| **서비스 메인** | https://ai-dubbing-seven.vercel.app |
| **GitHub 저장소** | https://github.com/jin-wook-lee-96/ai-dubbing |

### 배포 구조

- **GitHub `main` 브랜치 push → Vercel 자동 배포**
- Vercel 환경 변수는 Vercel 대시보드 → Settings → Environment Variables에서 관리
- DB 초기화: 최초 배포 후 `https://ai-dubbing-seven.vercel.app/api/db-init` 1회 호출

---

## 5. 코딩 에이전트 활용 방법 및 노하우

이 프로젝트는 **Claude Code**와 커스텀 에이전트를 적극 활용하여 개발되었습니다.

### 사용한 에이전트

프로젝트 루트 `.claude/agents/` 디렉터리에 정의된 5개의 전문 에이전트:

| 에이전트 | 역할 | 호출 상황 |
|----------|------|-----------|
| `code-error-fixer` | 코드 오류 진단 및 수정 | 빌드 실패, 런타임 에러, 타입 오류 |
| `frontend-senior-dev` | 프론트엔드 구현 | UI 컴포넌트 개발, 반응형 구현 |
| `senior-web-designer` | UI/UX 디자인 | 레이아웃, 색상 시스템, 컴포넌트 디자인 |
| `senior-pm-writer` | 문서 작성 및 정리 | README, 요구사항 문서, 보고서 |
| `security-auditor` | 보안 감사 및 취약점 점검 | API 통합, 인증 코드, 보안 리뷰 필요 시 |

각 에이전트는 `.claude/agent-memory/[agent-name]/` 경로에 대화 간 지속되는 메모리를 유지합니다.

### 노하우

**1. 에이전트에게 컨텍스트를 충분히 제공하라**

에이전트 호출 시 단순 요청보다 배경과 제약 조건을 함께 전달할수록 품질이 높아집니다.

```
# 나쁜 예
"로그인 버튼 고쳐줘"

# 좋은 예
"Google 로그인 버튼이 클릭해도 시각적 반응이 없어.
 서버 컴포넌트라 useState 못 씀. useFormStatus로 로딩 상태 추가해줘"
```

**2. 에러는 전체 스택 트레이스를 붙여라**

에러 메시지만 보내면 오진할 수 있습니다. Vercel 로그의 전체 스택 트레이스를 복사해서 붙이면 도메인(OpenAI인지, ElevenLabs인지 등)까지 정확하게 진단합니다.

**3. 점진적으로 검증하라**

전체 기능을 한번에 구현하지 말고 단계별로 확인하는 것이 훨씬 효율적입니다.

```
DB 초기화 확인 → 로그인 확인 → 더빙 API 확인 → UI 개선
```

**4. 배포 환경 변수는 별도로 관리하라**

`.env.local`이 올바르더라도 Vercel에 환경 변수를 별도로 설정해야 합니다.
에이전트가 로컬 파일만 보고 "설정됐다"고 판단할 수 있으니, Vercel 대시보드에서 직접 확인하는 습관이 중요합니다.

**5. 파일 크기 제약을 미리 파악하라**

Vercel Hobby 플랜은 요청 본문 **4.5MB 제한**이 있습니다.
이 프로젝트는 Vercel Blob을 통해 파일을 먼저 스토리지에 업로드한 뒤 URL만 API로 전달하는 방식으로 이 제한을 우회합니다. 덕분에 **최대 50MB** 파일을 처리할 수 있습니다.

**6. AGENTS.md / CLAUDE.md로 프레임워크 특이사항을 명시하라**

이 프로젝트는 표준 Next.js와 다른 버전을 사용합니다.
`AGENTS.md`에 이 사실을 명시해두면 에이전트가 `node_modules/next/dist/docs/`를 먼저 확인하고 잘못된 API를 사용하지 않습니다.

---

## 6. 보안

### 적용된 보안 조치

| # | 항목 | 설명 |
|---|------|------|
| 1 | **DB 초기화 인증** | `/api/db-init` 엔드포인트에 `auth()` 세션 검증 추가 — 인증된 사용자만 DB 초기화 가능 |
| 2 | **허용 이메일 환경변수화** | 하드코딩되어 있던 초기 허용 이메일을 `INITIAL_ALLOWED_EMAILS` 환경변수로 분리하여 소스 코드 노출 방지 |
| 3 | **SSRF 방어** | `/api/dubbing`에서 `blobUrl` 처리 전 도메인 화이트리스트 검증 추가 — 임의 내부망 URL 요청 차단 |
| 4 | **입력값 허용 목록** | `targetLang` 파라미터에 허용 언어 목록(allowlist) 적용 — 헤더/프롬프트 인젝션 방지 |
| 5 | **에러 메시지 sanitize** | API 응답에서 내부 스택 트레이스 및 경로 등 민감 정보를 제거하고 일반화된 메시지만 반환 |
| 6 | **보안 HTTP 헤더** | `next.config.ts`에 `X-Frame-Options`, `Strict-Transport-Security`, `Content-Security-Policy` 등 보안 헤더 적용 |

### security-auditor 에이전트

`.claude/agents/security-auditor` 에이전트는 Senior Security Engineer 페르소나로 동작하며, 다음 항목을 자동으로 감사합니다:

- 시크릿·자격증명·API 토큰 노출 여부
- 인증/인가 흐름의 취약점
- OWASP Top 10 취약점 점검
- 입력값 및 출력값 sanitization 검증

API 통합 코드 작성, 인증 로직 수정, 보안 리뷰가 필요한 시점에 자동으로 호출됩니다.

---

## 프로젝트 구조

```
src/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/   # NextAuth 핸들러
│   │   ├── blob-upload/          # Vercel Blob 업로드 토큰 발급
│   │   ├── db-init/              # DB 초기화 엔드포인트
│   │   ├── dubbing/              # 더빙 파이프라인 API
│   │   └── voices/               # ElevenLabs 음성 목록 조회
│   ├── dashboard/                # 메인 더빙 UI (인증 필요)
│   ├── unauthorized/             # 접근 차단 안내 페이지
│   ├── page.tsx                  # 랜딩 페이지
│   └── layout.tsx
├── components/
│   ├── DubbingForm.tsx           # 파일 업로드 + 더빙 폼 (자막·영상 출력 포함)
│   └── GoogleLoginButton.tsx     # 로그인 버튼 (로딩 상태 포함)
├── lib/
│   ├── auth.ts                   # NextAuth 설정 + 화이트리스트 검증
│   ├── db.ts                     # Drizzle ORM + Turso 연결
│   └── seed.ts                   # DB 시드 데이터
├── types/                        # 공유 TypeScript 타입 정의
└── proxy.ts                      # 미들웨어 (대시보드 접근 제어)
```

> **참고:** `public/` 디렉터리에 `9255102-hd_1920_1080_24fps.mp4`(랜딩 페이지 배경)와 `2page_2.mp4`(대시보드 배경)가 포함되어 있습니다.
