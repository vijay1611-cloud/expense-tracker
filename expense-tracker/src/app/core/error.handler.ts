import { ErrorHandler, inject, Injectable } from '@angular/core';
import { ToastService } from '../services/toast.service';

@Injectable()
export class AppErrorHandler implements ErrorHandler {
  private readonly toast = inject(ToastService);

  handleError(error: unknown): void {
    const msg = this.extractMessage(error);
    // Log in dev console for debugging; show a friendly toast to the user.
    console.error('[AppErrorHandler]', error);
    this.toast.error(msg);
  }

  private extractMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return 'Something went wrong. Please try again.';
  }
}
