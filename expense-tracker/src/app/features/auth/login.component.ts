import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { ButtonComponent } from '../../shared/ui/button.component';

@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  template: `
    <div class="bg-white rounded-2xl shadow-card border border-zinc-100 p-8 sm:p-10">
      <div class="flex flex-col items-center text-center">
        <span
          class="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-white font-bold"
          aria-hidden="true"
          >E</span
        >
        <h1 class="mt-5 text-2xl font-semibold tracking-tight text-zinc-900">Sign in</h1>
        <p class="mt-2 text-sm text-zinc-500 max-w-xs">
          Use your Google account. We'll request read-only access to your Gmail so we can find
          receipts.
        </p>
      </div>

      <div class="mt-8">
        <app-button
          variant="secondary"
          size="lg"
          [fullWidth]="true"
          [loading]="loading()"
          (click)="signIn()"
        >
          <svg viewBox="0 0 24 24" class="h-5 w-5 mr-2" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.77.42 3.44 1.18 4.93l3.66-2.83Z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.07.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38Z"
            />
          </svg>
          Continue with Google
        </app-button>
      </div>

      <p class="mt-6 text-xs text-center text-zinc-500 leading-relaxed">
        By signing in you agree we may scan recent transaction emails on your behalf. Your data is
        stored in your private Supabase row and is not shared.
      </p>
    </div>
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(false);

  async signIn(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    try {
      await this.auth.signInWithGoogle();
      // Redirect is handled by Supabase OAuth flow.
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Sign in failed');
      this.loading.set(false);
    }
  }
}
