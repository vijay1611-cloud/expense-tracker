import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SpinnerComponent } from '../../shared/ui/spinner.component';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SpinnerComponent],
  template: `
    <div class="bg-white rounded-2xl shadow-card border border-zinc-100 p-10 text-center">
      <div class="flex justify-center text-zinc-500">
        <app-spinner size="2rem" />
      </div>
      <p class="mt-4 text-sm text-zinc-600">Finishing sign in…</p>
    </div>
  `,
})
export class AuthCallbackComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  async ngOnInit(): Promise<void> {
    // Supabase parses the URL hash on init (detectSessionInUrl: true). We just wait for it.
    await this.auth.ready();
    // Poll briefly so the SIGNED_IN event has a chance to fire on slow networks.
    for (let i = 0; i < 30; i++) {
      if (this.auth.session()) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const target = this.auth.session() ? '/dashboard' : '/login';
    await this.router.navigateByUrl(target, { replaceUrl: true });
  }
}
