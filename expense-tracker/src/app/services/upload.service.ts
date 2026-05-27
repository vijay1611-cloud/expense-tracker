import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { UploadError, UploadResult } from '../models/upload-result.model';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly supabase = inject(SupabaseService);

  private readonly _uploading = signal(false);
  readonly uploading = this._uploading.asReadonly();

  async upload(file: File): Promise<UploadResult> {
    if (this._uploading()) {
      throw new UploadError('An upload is already in progress.');
    }
    if (!/\.pdf$/i.test(file.name)) {
      throw new UploadError('Only PDF files are supported.');
    }
    if (file.size === 0) {
      throw new UploadError('File is empty.');
    }
    if (file.size > MAX_BYTES) {
      throw new UploadError(
        `File is ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximum is ${MAX_BYTES / 1024 / 1024} MB.`,
      );
    }

    this._uploading.set(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const [fileBase64, fileHash] = await Promise.all([
        bytesToBase64(bytes),
        sha256Hex(bytes),
      ]);

      const { data, error } = await this.supabase.client.functions.invoke<UploadResult>(
        'upload-statement',
        {
          body: {
            filename: file.name,
            fileBase64,
            fileHash,
          },
        },
      );

      if (error) {
        const ctx = (error as unknown as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          try {
            const errBody = await ctx.json() as { error?: string };
            throw new UploadError(errBody.error ?? error.message, ctx.status);
          } catch (e) {
            if (e instanceof UploadError) throw e;
          }
        }
        throw new UploadError(error.message);
      }
      if (!data) {
        throw new UploadError('Empty response from upload function.');
      }
      return data;
    } finally {
      this._uploading.set(false);
    }
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
