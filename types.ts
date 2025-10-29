
export interface SpeechAnalysis {
  confidence_score: number;
  clarity_score: number;
  fluency_score: number;
  emotional_tone: string;
  filler_words_detected: string[];
  average_pause_length_seconds: number;
  issues_detected: string[];
  summary_feedback: string;
  improvement_advice: string[];
}
