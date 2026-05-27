export interface UploadResult {
  inserted: number;
  scanned: number;
  errors: string[];
  uploadRunId: string | null;
  alreadyProcessed?: boolean;
}

export class UploadError extends Error {
  constructor(message: string, public readonly httpStatus?: number) {
    super(message);
    this.name = 'UploadError';
  }
}
