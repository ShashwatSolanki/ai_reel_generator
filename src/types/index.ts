export interface GenerationRequest {
  filePath: string;
}

export interface GenerationResponse {
  success: boolean;
  videoUrl?: string;
  error?: string;
}
