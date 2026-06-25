/**
 * Page object helpers for Peripateticware E2E tests.
 *
 * Usage:
 *   import { LoginPage, TeacherNav, expectNoConsoleErrors, waitForPageReady } from './helpers/page-objects';
 */
import { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// LoginPage
// ---------------------------------------------------------------------------

export class LoginPage {
  readonly page: Page;
  readonly forgotPasswordLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.forgotPasswordLink = page.getByRole('link', { name: /forgot.*(password)?/i });
  }

  async goto(): Promise<void> {
    await this.page.goto('/login');
  }

  async fillEmail(email: string): Promise<void> {
    await this.page.getByLabel(/email/i).fill(email);
  }

  async fillPassword(password: string): Promise<void> {
    await this.page.getByLabel(/password/i).fill(password);
  }

  async submit(): Promise<void> {
    await this.page.getByRole('button', { name: /sign in|log in/i }).click();
  }

  async loginAs(email: string, password: string): Promise<void> {
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.submit();
  }

  async expectError(): Promise<void> {
    // Matches common error patterns: alert roles, aria-live regions, or text
    // containing "invalid", "incorrect", or "failed".
    const errorLocator = this.page
      .getByRole('alert')
      .or(this.page.locator('[aria-live="assertive"], [aria-live="polite"]'))
      .or(this.page.getByText(/invalid|incorrect|failed|wrong/i));
    await expect(errorLocator.first()).toBeVisible({ timeout: 5_000 });
  }

  async clickForgotPassword(): Promise<void> {
    await this.forgotPasswordLink.click();
  }
}

// ---------------------------------------------------------------------------
// NavSidebar (base)
// ---------------------------------------------------------------------------

export class NavSidebar {
  readonly page: Page;
  protected readonly sidebar: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sidebar = page.locator('aside');
  }

  async expectVisible(): Promise<void> {
    await expect(this.sidebar).toBeVisible();
  }

  async clickLink(text: string): Promise<void> {
    await this.sidebar.getByRole('link', { name: text }).click();
  }

  async goto(href: string): Promise<void> {
    await this.page.goto(href);
  }
}

// ---------------------------------------------------------------------------
// TeacherNav
// ---------------------------------------------------------------------------

export class TeacherNav extends NavSidebar {
  async gotoActivities(): Promise<void> {
    await this.goto('/teacher/activities');
  }

  async gotoSubmissions(): Promise<void> {
    await this.goto('/teacher/submissions');
  }

  async gotoRubrics(): Promise<void> {
    await this.goto('/teacher/rubrics');
  }

  async gotoStudents(): Promise<void> {
    await this.goto('/teacher/students');
  }

  async gotoClassrooms(): Promise<void> {
    await this.goto('/teacher/classrooms');
  }

  async gotoSettings(): Promise<void> {
    await this.goto('/teacher/settings');
  }

  async gotoProposalReview(): Promise<void> {
    await this.goto('/teacher/proposals');
  }

  async gotoStandards(): Promise<void> {
    await this.goto('/teacher/standards');
  }

  async gotoProjects(): Promise<void> {
    await this.goto('/teacher/projects');
  }
}

// ---------------------------------------------------------------------------
// StudentNav
// ---------------------------------------------------------------------------

export class StudentNav extends NavSidebar {
  async gotoDashboard(): Promise<void> {
    await this.goto('/student/dashboard');
  }

  async gotoActivities(): Promise<void> {
    await this.goto('/student/activities');
  }

  async gotoFieldNotes(): Promise<void> {
    await this.goto('/student/field-notes');
  }

  async gotoJournal(): Promise<void> {
    await this.goto('/student/journal');
  }

  async gotoProposals(): Promise<void> {
    await this.goto('/student/proposals');
  }

  async gotoSettings(): Promise<void> {
    await this.goto('/student/settings');
  }
}

// ---------------------------------------------------------------------------
// ParentNav
// ---------------------------------------------------------------------------

export class ParentNav extends NavSidebar {
  async gotoDashboard(): Promise<void> {
    await this.goto('/parent/dashboard');
  }

  async gotoProgress(): Promise<void> {
    await this.goto('/parent/progress');
  }

  async gotoSettings(): Promise<void> {
    await this.goto('/parent/settings');
  }
}

// ---------------------------------------------------------------------------
// AdminNav
// ---------------------------------------------------------------------------

export class AdminNav extends NavSidebar {
  async gotoDashboard(): Promise<void> {
    await this.goto('/admin/dashboard');
  }

  async gotoUsers(): Promise<void> {
    await this.goto('/admin/users');
  }

  async gotoClasses(): Promise<void> {
    await this.goto('/admin/classes');
  }

  async gotoAnalytics(): Promise<void> {
    await this.goto('/admin/analytics');
  }

  async gotoSystem(): Promise<void> {
    await this.goto('/admin/system');
  }

  async gotoPrivacy(): Promise<void> {
    await this.goto('/admin/privacy');
  }

  async gotoLogs(): Promise<void> {
    await this.goto('/admin/logs');
  }

  async gotoSettings(): Promise<void> {
    await this.goto('/admin/settings');
  }
}

// ---------------------------------------------------------------------------
// expectNoConsoleErrors
// ---------------------------------------------------------------------------

/** Patterns to suppress — favicon 404s, browser extension noise, etc. */
const IGNORED_ERROR_PATTERNS: RegExp[] = [
  /favicon/i,
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  /net::ERR_/i,              // network-level errors unrelated to app logic
  /ResizeObserver loop/i,    // benign browser warning
];

/**
 * Attaches a console-error listener to `page` and returns a `checkErrors()`
 * function. Call `checkErrors()` at the end of a test to assert that no
 * unexpected application errors were logged.
 *
 * @example
 * const { checkErrors } = expectNoConsoleErrors(page);
 * // ... do stuff ...
 * await checkErrors();
 */
export function expectNoConsoleErrors(page: Page): { checkErrors: () => Promise<void> } {
  const errors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORED_ERROR_PATTERNS.some((re) => re.test(text))) return;
    errors.push(text);
  });

  page.on('pageerror', (err) => {
    const text = err.message;
    if (IGNORED_ERROR_PATTERNS.some((re) => re.test(text))) return;
    errors.push(text);
  });

  return {
    checkErrors: async () => {
      expect(
        errors,
        `Expected no console errors but found:\n${errors.join('\n')}`,
      ).toHaveLength(0);
    },
  };
}

// ---------------------------------------------------------------------------
// waitForPageReady
// ---------------------------------------------------------------------------

/**
 * Waits for the page to reach network idle and for the <body> to contain
 * at least some rendered content. Useful after navigations that don't trigger
 * a full reload.
 */
export async function waitForPageReady(page: Page): Promise<void> {
  await page.waitForLoadState('load');
  await expect(page.locator('body')).not.toBeEmpty();
}
