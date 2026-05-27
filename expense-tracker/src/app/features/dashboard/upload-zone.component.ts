import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { UploadService } from '../../services/upload.service';
import { TransactionsService } from '../../services/transactions.service';
import { UploadHistoryService } from '../../services/upload-history.service';
import { ToastService } from '../../services/toast.service';
import { UploadError } from '../../models/upload-result.model';
import { SpinnerComponent } from '../../shared/ui/spinner.component';

@Component({
  selector: 'app-upload-zone',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SpinnerComponent],
  template: `
    <div
      class="rounded-2xl border-2 border-dashed transition-colors p-6 sm:p-8 text-center cursor-pointer focus-ring"
      [class.border-zinc-200]="!isDragging() && !uploadService.uploading()"
      [class.border-zinc-900]="isDragging()"
      [class.bg-stone-50]="isDragging()"
      [class.opacity-60]="uploadService.uploading()"
      [class.cursor-not-allowed]="uploadService.uploading()"
      role="button"
      tabindex="0"
      (click)="pick()"
      (keydown.enter)="pick()"
      (keydown.space)="pick(); $event.preventDefault()"
      (dragenter)="onDragEnter($event)"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave($event)"
      (drop)="onDrop($event)"
    >
      <input
        #fileInput
        type="file"
        accept="application/pdf,.pdf"
        class="hidden"
        (change)="onPick($event)"
      />

      @if (uploadService.uploading()) {
        <div class="flex flex-col items-center gap-3 text-zinc-600">
          <app-spinner size="1.5rem" />
          <p class="text-sm font-medium">Reading your statement…</p>
          <p class="text-xs text-zinc-500 max-w-xs">
            This usually takes 10–60 seconds depending on the statement length.
          </p>
        </div>
      } @else {
        <div class="flex flex-col items-center gap-2">
          <span
            class="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-white"
            aria-hidden="true"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-5 w-5"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </span>
          <p class="text-sm font-semibold text-zinc-900">
            Drop a statement PDF here, or click to choose
          </p>
          <p class="text-xs text-zinc-500">
            PhonePe / GPay / Paytm / bank statement · PDF only · up to 5 MB
          </p>
        </div>
      }
    </div>
  `,
})
export class UploadZoneComponent {
  readonly uploadService = inject(UploadService);
  private readonly tx = inject(TransactionsService);
  private readonly history = inject(UploadHistoryService);
  private readonly toast = inject(ToastService);

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  readonly isDragging = signal(false);
  readonly uploaded = output<void>();

  pick(): void {
    if (this.uploadService.uploading()) return;
    this.fileInput().nativeElement.click();
  }

  onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-picking the same file later
    if (file) void this.handle(file);
  }

  onDragEnter(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.uploadService.uploading()) this.isDragging.set(true);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
    if (this.uploadService.uploading()) return;
    const file = event.dataTransfer?.files?.[0];
    if (file) void this.handle(file);
  }

  private async handle(file: File): Promise<void> {
    try {
      const result = await this.uploadService.upload(file);
      if (result.alreadyProcessed) {
        this.toast.info('This file has already been processed.');
      } else if (result.inserted > 0) {
        this.toast.success(
          `Imported ${result.inserted} transaction${result.inserted === 1 ? '' : 's'} from ${file.name}.`,
        );
      } else if (result.scanned > 0) {
        this.toast.info(`Scanned ${file.name} — no expenses extracted.`);
      } else {
        this.toast.info(`Couldn't find any transactions in ${file.name}.`);
      }
      await Promise.all([this.tx.load(), this.history.load()]);
      this.uploaded.emit();
    } catch (e) {
      const msg = e instanceof UploadError || e instanceof Error
        ? e.message
        : 'Upload failed';
      this.toast.error(msg);
    }
  }
}
