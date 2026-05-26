import type { TopicMetadataOverride } from '../content/contentTypes'

export const topicOverrides: Record<string, TopicMetadataOverride> = {
  '업무-효율화-etl-로그-모니터링-일원화': {
    question: 'Tell me about a time you improved work efficiency without being asked.',
    altQuestion: 'Describe an initiative where you removed a workflow bottleneck.',
    topicKor: '시키지 않아도 비효율을 찾아 없앤 경험',
    summaryKo: '분리된 레거시 로그 확인을 메인 UI에 통합해 이중 접속을 없앤 사례입니다.',
  },
  '시스템-분석-및-비즈니스-로직-문서화': {
    question: 'Tell me about a time you documented a complex system or business logic.',
    altQuestion: 'How did you stabilize an undocumented production process?',
    topicKor: '문서화되지 않은 시스템 로직을 분석하고 표준화한 경험',
    summaryKo: '대규모 투자 시스템의 결산 로직을 분석해 표준 가이드와 200페이지 문서를 만든 사례입니다.',
  },
  '타-부서외부-팀와의-협업-및-성능-개선-다올투자증권': {
    question: 'Tell me about a time you collaborated with another team to deliver a product.',
    altQuestion: 'How did you align competing priorities across teams?',
    topicKor: '외부 모바일 팀과 협업해 MTS 현대화를 출시한 경험',
    summaryKo: '백엔드 관리성과 빠른 데이터 제공 요구를 조율하며 API 개발과 일정 관리를 수행한 사례입니다.',
  },
  '외부-데이터-오류에-의한-장애-해결-및-이중-검증-다올투자증권': {
    question: 'Tell me about a time you handled a production issue caused by external data.',
    altQuestion: 'Describe how you prevented the same batch failure from happening again.',
    topicKor: '외부 데이터 오류를 해결하고 재발 방지 장치를 만든 경험',
    summaryKo: '배치 실패를 장 시작 전에 복구하고 외부·내부 이중 검증을 추가한 사례입니다.',
  },
  '단점-및-극복-노력-순발력-부족과-철저한-검증-그리고-클라우드-경험-부족': {
    question: 'What is your weakness, and how are you working on it?',
    altQuestion: 'Tell me about a limitation you are actively improving.',
    topicKor: '순발력과 클라우드 경험 부족을 준비와 학습으로 보완하는 답변',
    summaryKo: '즉흥성 부족은 철저한 검증으로 보완하고, 클라우드 경험 부족은 자율 학습으로 메우는 이야기입니다.',
  },
  '5년의-공백기-미국-정착-및-자기-계발': {
    question: 'Can you explain your five-year career gap?',
    altQuestion: 'What did you do during your career break?',
    topicKor: '미국 정착 기간에도 프로젝트와 학습으로 역량을 유지한 이야기',
    summaryKo: '가족 정착과 영주권 취득 사이에도 개인 프로젝트와 클라우드 학습으로 기술 감각을 유지한 사례입니다.',
  },
  '상황-1-정확한-기술-용어나-문법이-기억나지-않을-때': {
    question: 'What would you say if you cannot remember the exact syntax during an interview?',
    altQuestion: 'How do you respond when you know the concept but not the exact term?',
    topicKor: '정확한 문법이나 용어가 바로 떠오르지 않을 때의 대응',
    summaryKo: '개념 이해는 분명히 하되 실무에서는 기존 코드와 문서를 참고한다고 답하는 짧은 패턴입니다.',
  },
  '상황-2-너는-업무를-보통-어떻게-시작해': {
    question: 'How do you usually start your work on a codebase?',
    altQuestion: 'Do you rely on memory or on existing team conventions?',
    topicKor: '기억보다 기존 코드와 가이드를 먼저 보는 작업 방식',
    summaryKo: '기억력보다 안정성을 우선해 기존 코드와 가이드를 먼저 분석하는 스타일을 설명하는 패턴입니다.',
  },
  '상황-3-정말-아예-모르는-기술을-물어봤을-때': {
    question: 'How do you answer when you have not used a specific technology before?',
    altQuestion: 'What do you say if someone asks whether you have used Kafka or a tool you do not know?',
    topicKor: '직접 경험이 없는 기술을 받았을 때의 답변',
    summaryKo: '직접 경험은 없지만 빠르게 학습하는 능력과 최근 자기주도 학습 예시를 함께 말하는 패턴입니다.',
  },
}
