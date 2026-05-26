import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 pointer-events-none px-4">
      @for (t of toast.toasts(); track t.id) {
        <div
          class="pointer-events-auto w-full max-w-md rounded-xl border shadow-elevated px-4 py-3 flex items-start gap-3 text-sm"
          [class.bg-white]="t.kind !== 'error'"
          [class.text-zinc-900]="t.kind !== 'error'"
          [class.border-zinc-200]="t.kind === 'info'"
          [class.border-emerald-200]="t.kind === 'success'"
          [class.bg-emerald-50]="t.kind === 'success'"
          [class.bg-red-50]="t.kind === 'error'"
          [class.border-red-200]="t.kind === 'error'"
          [class.text-red-900]="t.kind === 'error'"
        >
          <span class="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold"
            [class.bg-zinc-100]="t.kind === 'info'"
            [class.text-zinc-700]="t.kind === 'info'"
            [class.bg-emerald-100]="t.kind === 'success'"
            [class.text-emerald-700]="t.kind === 'success'"
            [class.bg-red-100]="t.kind === 'error'"
            [class.text-red-700]="t.kind === 'error'"
          >
            {{ icon(t.kind) }}
          </span>
          <span class="flex-1 leading-relaxed">{{ t.message }}</span>
          <button
            type="button"
            class="text-zinc-400 hover:text-zinc-700 focus-ring rounded"
            (click)="toast.dismiss(t.id)"
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastComponent {
  readonly toast = inject(ToastService);
  icon(kind: 'info' | 'success' | 'error'): string {
    return kind === 'success' ? '✓' : kind === 'error' ? '!' : 'i';
  }
}
