export interface UploadRun {
  id: string;
  user_id: string;
  filename: string | null;
  file_size_bytes: number | null;
  file_hash: string | null;
  inserted: number;
  scanned: number;
  errors_count: number;
  started_at: string;
  finished_at: string;
}
