
export enum Step {
  LANDING = 'LANDING',
  EMOTION = 'EMOTION',
  MEMORY_PROMPT = 'MEMORY_PROMPT',
  VOICE_INPUT = 'VOICE_INPUT',
  CAREER = 'CAREER',
  THANK_YOU = 'THANK_YOU',
  ADMIN = 'ADMIN'
}

export interface FeedbackData {
  id: string;
  timestamp: number;
  emotion: string | null;
  memoryRecalled: boolean | null;
  voiceAudioBase64: string | null;
  career: string | null;
  performanceId: string;
  aiTranscription?: string;
  aiSummary?: string;
}

export interface EmotionOption {
  label: string;
  icon: string;
  color: string;
}

export interface CareerOption {
  id: string;
  label: string;
}
