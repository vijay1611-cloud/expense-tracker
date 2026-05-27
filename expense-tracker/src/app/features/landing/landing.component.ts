import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonComponent } from '../../shared/ui/button.component';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-landing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ButtonComponent],
  template: `
    <div class="min-h-screen bg-stone-50 text-zinc-900">
      <header class="px-4 sm:px-8 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <a routerLink="/" class="flex items-center gap-2 focus-ring rounded">
          <span
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white font-bold text-sm"
            >E</span
          >
          <span class="font-semibold tracking-tight">Expense</span>
        </a>
        <nav class="flex items-center gap-2">
          @if (auth.session()) {
            <a routerLink="/dashboard">
              <app-button variant="primary" size="sm">Open dashboard</app-button>
            </a>
          } @else {
            <a routerLink="/login">
              <app-button variant="ghost" size="sm">Sign in</app-button>
            </a>
            <a routerLink="/login">
              <app-button variant="primary" size="sm">Get started</app-button>
            </a>
          }
        </nav>
      </header>

      <section class="max-w-3xl mx-auto px-4 sm:px-8 pt-16 sm:pt-24 pb-12 text-center">
        <span
          class="inline-flex items-center gap-2 rounded-full bg-white border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-700 shadow-card"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
          AI-powered statement parsing — your data stays yours
        </span>
        <h1
          class="mt-6 text-4xl sm:text-6xl font-bold tracking-tight leading-[1.05]"
        >
          Drop a statement,<br />
          <span class="text-zinc-500">see every transaction.</span>
        </h1>
        <p class="mt-6 text-lg text-zinc-600 max-w-xl mx-auto leading-relaxed">
          Upload your monthly UPI or bank statement PDF. We extract merchants, amounts, dates, and
          categories automatically — no inbox access required.
        </p>
        <div class="mt-8 flex items-center justify-center gap-3">
          <a routerLink="/login">
            <app-button variant="primary" size="lg">Sign in with Google</app-button>
          </a>
        </div>
        <p class="mt-4 text-xs text-zinc-500">
          Sign-in is just for identity — we never read your email.
        </p>
      </section>

      <section class="max-w-5xl mx-auto px-4 sm:px-8 pb-24 grid sm:grid-cols-3 gap-4">
        <div class="bg-white rounded-2xl shadow-card border border-zinc-100 p-6">
          <h3 class="font-semibold">Sign in once</h3>
          <p class="mt-2 text-sm text-zinc-600 leading-relaxed">
            Use your Google account just to identify yourself. No inbox or Drive access.
          </p>
        </div>
        <div class="bg-white rounded-2xl shadow-card border border-zinc-100 p-6">
          <h3 class="font-semibold">Drop a PDF</h3>
          <p class="mt-2 text-sm text-zinc-600 leading-relaxed">
            PhonePe, GPay, Paytm, or bank statement — drag it onto the dashboard.
          </p>
        </div>
        <div class="bg-white rounded-2xl shadow-card border border-zinc-100 p-6">
          <h3 class="font-semibold">See it all</h3>
          <p class="mt-2 text-sm text-zinc-600 leading-relaxed">
            Monthly totals, category breakdown, searchable transaction history.
          </p>
        </div>
      </section>
    </div>
  `,
})
export class LandingComponent {
  readonly auth = inject(AuthService);
}
