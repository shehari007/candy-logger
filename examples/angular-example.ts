// Angular — Candy Logger v2.1
import { ErrorHandler, Injectable } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { overrideConsole, type CandyLogger } from 'candy-logger';
import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

const logger: CandyLogger = overrideConsole({
  enabled: !environment.production,
  theme: 'auto',
  badgeText: 'NG',
});

/** Send every uncaught Angular error to the panel with its full stack. */
@Injectable()
export class CandyErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    logger.error('Uncaught Angular error', error);
  }
}
// providers: [{ provide: ErrorHandler, useClass: CandyErrorHandler }]

platformBrowserDynamic()
  .bootstrapModule(AppModule)
  .catch((err) => logger.error('Bootstrap failed', err));
