import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: `
    <div class="min-h-screen flex items-center justify-center px-4 py-12 bg-stone-50">
      <div class="w-full max-w-md">
        <router-outlet />
      </div>
    </div>
  `,
})
export class AuthLayoutComponent {}
