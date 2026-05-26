# Recall Speaking Trainer

자동 카드 세션 기반 영어 면접 회상 훈련 앱입니다.

이 프로젝트는 영어 답변을 정밀 채점하는 앱이 아니라, 질문 또는 의미만 보고 답을 `회상해서 많이 말하게 만드는` 자동 진행형 스피킹 훈련 앱을 목표로 합니다.

## 핵심 철학
- 사용자는 처음부터 영어 원문을 읽지 않습니다.
- UI는 단순하고, 사용자가 누르는 버튼은 사실상 `세션 시작` 하나만 남깁니다.
- 문장 단계에서는 의미를 보고 말하고, 답변 단계에서는 질문을 듣고 통답변을 말합니다.
- 무발화가 감지되면 세션을 멈추고, 사용자는 `세션 시작`을 다시 눌러 재시작합니다.
- Azure 여부와 상관없이 세션 UX는 같고, evaluator adapter만 달라집니다.

## 제품 구조
```text
src/
  app/
    practiceDeck.ts
    useRecallTrainer.ts
  content/
    contentTypes.ts
    scriptNormalizer.ts
    cardExtractor.ts
  data/
    interviewScripts.raw.txt
    topicOverrides.ts
    cardOverrides.ts
    loadDataset.ts
  session/
    autoSessionController.ts
    speechTurnController.ts
    hintEngine.ts
    sessionQueue.ts
    topicRunPlanner.ts
    sessionTypes.ts
  speech/
    evaluatorTypes.ts
    browserHeuristics.ts
    browserEvaluator.ts
    azureEvaluatorClient.ts
    speechRecognitionAdapter.ts
    vad.ts
  storage/
    spacedRepetitionStore.ts
    storageAdapter.ts
  ui/
    SessionShell.tsx
    CardView.tsx

server/
  index.ts
  azureEvaluator.ts

tests/
  contentPipeline.test.ts
  sessionEngine.test.ts
```

## 데이터셋과 normalize 규칙
원본 스크립트는 [src/data/interviewScripts.raw.txt](src/data/interviewScripts.raw.txt)에 저장되어 있으며, 이 파일이 source of truth입니다.

각 topic은 다음 순서를 유지합니다.
1. 한국어 title
2. 한국어 설명 블록
3. 영어 segmented answer

`scriptNormalizer`는 이 원본을 읽어 다음 필드를 가진 `NormalizedTopic`으로 변환합니다.
- `id`
- `title`
- `question`
- `altQuestion`
- `topicKor`
- `summaryKo`
- `bridge`
- `body`
- `filler`
- `glue`
- `orderedSegments`

영어 답변은 `/` 구분자를 기준으로 먼저 chunk로 나눈 뒤, 규칙 기반으로 `bridge`, `body`, `filler`, `glue` 타입을 부여합니다.

## 카드 추출
학습 기본 단위는 `full sentence`가 아니라 짧은 recall card입니다.

`cardExtractor`는 `orderedSegments`를 바탕으로 카드별로 다음 정보를 생성합니다.
- `id`
- `topicId`
- `type`
- `order`
- `prompt`
- `answer`
- `keywords`
- `cloze`

오버라이드는 다음 파일로 확장할 수 있습니다.
- topic metadata: [src/data/topicOverrides.ts](src/data/topicOverrides.ts)
- card-level override: [src/data/cardOverrides.ts](src/data/cardOverrides.ts)

## 세션 흐름
이 앱은 두 가지 단계를 가집니다.

### 1. 문장 단계
1. 화면에 문장 의미를 보여줍니다.
2. 모범 음성을 읽어 줍니다.
3. 모범 음성 길이의 약 1.5배 동안 자동 녹음합니다.
4. 결과를 화면에 보여줍니다.
5. 2초 뒤 다음 문장으로 자동 이동합니다.
6. 덱 끝까지 가면 처음부터 다시 돌며 계속 이어집니다.
7. 말이 전혀 없으면 세션을 멈추고, 사용자는 `세션 시작`을 다시 눌러야 합니다.

### 2. 답변 단계
1. 질문을 화면에 보여주고 읽어 줍니다.
2. 약 3분 동안 자동 녹음합니다.
3. 결과를 화면에 보여줍니다.
4. 2초 뒤 다음 질문으로 자동 이동합니다.
5. 덱 끝까지 가면 처음부터 다시 돌며 계속 이어집니다.
6. 말이 전혀 없으면 세션을 멈추고, 사용자는 `세션 시작`을 다시 눌러야 합니다.

평가 상태는 여전히 다음 네 가지를 사용합니다.
- `pass_content_good_fluency`
- `pass_content_weak_fluency`
- `fail_content`
- `no_speech_or_idle`

## Browser mode / Azure mode
### Browser mode
- 브라우저 음성 인식과 로컬 heuristic을 사용합니다.
- 핵심 키워드 커버율, 답변 토큰 겹침, 발화 시작 지연, 발화 길이를 종합해 판정합니다.
- 속도와 반복성을 우선하는 경량 evaluator입니다.

### Azure mode
- 로컬에서 녹음한 WAV 오디오를 서버로 전송합니다.
- 서버에서 Azure Speech pronunciation assessment를 사용합니다.
- `AZURE_SPEECH_KEY` 와 `AZURE_SPEECH_REGION` 이 없으면 세션 UX를 깨지 않도록 heuristic fallback으로 동작합니다.

## 실행 방법
### 1. 의존성 설치
```bash
npm install
```

### 2. 프론트엔드 + 서버 동시 실행
```bash
npm run dev
```

- 앱: `http://localhost:5173`
- 로컬 API 서버: `http://localhost:8787`

### 3. 프론트엔드만 실행
```bash
npm run dev:app
```

### 4. 서버만 실행
```bash
npm run dev:server
```

### 5. 테스트
```bash
npm test
```

### 6. 린트
```bash
npm run lint
```

### 7. 프로덕션 빌드
```bash
npm run build
```

## Azure 환경 변수
Azure 평가를 쓰려면 아래 값을 설정하세요.

```bash
export AZURE_SPEECH_KEY="your-key"
export AZURE_SPEECH_REGION="your-region"
```

선택적으로 포트를 바꾸려면:

```bash
export PORT=8787
```

## 구현 메모
- 단계별 덱 구성은 [src/app/practiceDeck.ts](src/app/practiceDeck.ts)에서 관리합니다.
- 메인 세션 오케스트레이션은 [src/app/useRecallTrainer.ts](src/app/useRecallTrainer.ts)에서 처리합니다.
- 자동 턴 캡처는 [src/session/speechTurnController.ts](src/session/speechTurnController.ts)에서 처리합니다.
- Browser heuristic은 [src/speech/browserHeuristics.ts](src/speech/browserHeuristics.ts)에 있습니다.

## 현재 MVP 범위
포함:
- raw dataset import
- normalize + card extraction
- 문장 단계 / 답변 단계 분리
- 자동 오디오 재생 + 자동 녹음 + 자동 다음 항목 이동
- 심플한 단일 화면 UI
- Browser/Azure evaluator adapter
- 무발화 시 정지 후 세션 시작으로 재개
- 핵심 순수 로직 테스트

제외:
- 사용자 계정
- 서버 DB
- 고급 발화 분석 차트
- 녹음 히스토리 보관
- 정교한 prosody 시각화

## 확장 아이디어
- IndexedDB 또는 서버 DB 기반 복습 저장소
- 수동 card boundary 편집 UI
- 카드별 한국어 힌트 오버라이드
- 더 정교한 VAD와 pause 분류
- 토픽 선택 정책 커스터마이즈
