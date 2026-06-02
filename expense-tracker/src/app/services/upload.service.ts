import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { PdfTextService } from './pdf-text.service';
import { parseGPayStatement, ParsedTransaction } from './parsers/gpay-parser';
import { categorize } from './category-rules';
import { UploadError, UploadResult } from '../models/upload-result.model';
import { TransactionCategory } from '../models/transaction.model';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export interface StructuredTransaction {
  merchant: string;
  amount: number;
  currency: string;
  transaction_date: string;
  category: TransactionCategory;
  is_subscription: boolean;
}

@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly supabase = inject(SupabaseService);
  private readonly pdfText = inject(PdfTextService);

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
      const fileHash = await sha256Hex(bytes);

      // ---- Client-side: extract text → parse → categorize ----
      let parsed: ParsedTransaction[];
      try {
        const text = await this.pdfText.extractAllText(bytes);

        // TEMP DEBUG — remove once parser is tuned.
        console.group('[pdf-debug]');
        console.log('Raw extracted text length:', text.length, 'chars');
        console.log('First 3000 chars of extracted text:');
        console.log(text.slice(0, 3000));
        console.log('Last 1500 chars:');
        console.log(text.slice(-1500));
        parsed = parseGPayStatement(text);
        console.log(`Parser matched ${parsed.length} transactions`);
        if (parsed.length > 0) {
          console.table(parsed.slice(0, 5).map(({ merchant, amount, currency, transaction_date, raw_type }) => ({
            merchant, amount, currency, transaction_date, raw_type,
          })));
        }
        console.groupEnd();
      } catch (e) {
        throw new UploadError(
          `Couldn't read the PDF: ${e instanceof Error ? e.message : 'unknown error'}. ` +
            `If the file is password-protected, please decrypt it first.`,
        );
      }

      if (parsed.length === 0) {
        // Still send to backend so we log the upload attempt — but no rows go in.
        return await this.send(file, fileHash, []);
      }

      // Apply rules engine
      const structured: StructuredTransaction[] = parsed
        .filter((p) => p.is_expense)
        .map((p) => {
          const { category, is_subscription } = categorize(p.merchant);
          return {
            merchant: p.merchant,
            amount: p.amount,
            currency: p.currency,
            transaction_date: p.transaction_date,
            category,
            is_subscription,
          };
        });

      return await this.send(file, fileHash, structured);
    } finally {
      this._uploading.set(false);
    }
  }

  private async send(
    file: File,
    fileHash: string,
    transactions: StructuredTransaction[],
  ): Promise<UploadResult> {
    const { data, error } = await this.supabase.client.functions.invoke<UploadResult>(
      'upload-statement',
      {
        body: {
          filename: file.name,
          fileSize: file.size,
          fileHash,
          transactions,
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
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
