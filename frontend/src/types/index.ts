export interface User {
  id: number;
  email: string;
  username: string;
  role: 'user' | 'admin';
  email_verified: boolean;
}

export interface Test {
  id: number;
  title: string;
  university: string;
  author_id: number;
  author_name: string;
  access_type: 'public' | 'private';
  question_type: 'single' | 'multiple';
  is_blocked: number;
  question_count: number;
  created_at: string;
}

export interface Question {
  id: number;
  test_id: number;
  text: string;
  options: string[];
  correct_answers: number[];
  order_num: number;
}

export interface PendingQuestion {
  id: number;
  test_id: number;
  text: string;
  options: string[];
  confidence: number;
  created_at: string;
}

export interface TestResult {
  id: number;
  user_id: number | null;
  test_id: number;
  score: number;
  total: number;
  time_spent: number;
  answers: UserAnswer[];
  mode: 'normal' | 'exam';
  created_at: string;
}

export interface UserAnswer {
  question_id: number;
  selected: number[];
  correct: boolean;
}

export interface UploadResponse {
  hasImages?: boolean;
  imageWarnings?: string[];
  duplicate?: { id: number; title: string } | null;
  textPreview?: string;
  id?: number;
  confirmed?: number;
  pending?: number;
  total?: number;
  message?: string;
}
