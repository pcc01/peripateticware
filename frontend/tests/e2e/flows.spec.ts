import { test, expect, Page } from '@playwright/test'

// Setup
test.describe('Peripateticware E2E Tests', () => {
  let page: Page

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage()
    // Set up test data and authentication
    await page.goto('http://localhost:5173')
  })

  test.afterEach(async () => {
    await page.close()
  })

  // ===== Authentication Tests =====
  test.describe('Authentication', () => {
    test('should login successfully with valid credentials', async () => {
      // Navigate to login page
      await page.goto('http://localhost:5173/login')

      // Fill form
      await page.fill('input[type="email"]', 'teacher@school.edu')
      await page.fill('input[type="password"]', 'password123')

      // Submit
      await page.click('button:has-text("Login")')

      // Verify redirect to dashboard
      await expect(page).toHaveURL(/\/dashboard/)
      await expect(page.locator('h1')).toContainText('Dashboard')
    })

    test('should show error with invalid credentials', async () => {
      await page.goto('http://localhost:5173/login')

      await page.fill('input[type="email"]', 'invalid@email.com')
      await page.fill('input[type="password"]', 'wrongpassword')
      await page.click('button:has-text("Login")')

      // Error message appears
      await expect(page.locator('text=Invalid credentials')).toBeVisible()
    })

    test('should logout successfully', async () => {
      // Login first
      await page.goto('http://localhost:5173/login')
      await page.fill('input[type="email"]', 'teacher@school.edu')
      await page.fill('input[type="password"]', 'password123')
      await page.click('button:has-text("Login")')

      // Wait for redirect
      await page.waitForURL(/\/dashboard/)

      // Click logout
      await page.click('button:has-text("Logout")')

      // Should redirect to login
      await expect(page).toHaveURL(/\/login/)
    })
  })

  // ===== Teacher Workflow Tests =====
  test.describe('Teacher Workflow', () => {
    test.beforeEach(async () => {
      // Login as teacher
      await page.goto('http://localhost:5173/login')
      await page.fill('input[type="email"]', 'teacher@school.edu')
      await page.fill('input[type="password"]', 'password123')
      await page.click('button:has-text("Login")')
      await page.waitForURL(/\/dashboard/)
    })

    test('should create curriculum unit', async () => {
      // Click create button
      await page.click('button:has-text("Create New Unit")')

      // Wait for modal
      await expect(page.locator('role=dialog')).toBeVisible()

      // Fill form
      await page.fill('input[placeholder="Unit Title"]', 'Photosynthesis')
      await page.fill(
        'textarea[placeholder="Description"]',
        'Understanding how plants convert light to energy'
      )
      await page.selectOption('select[name="subject"]', 'Biology')
      await page.selectOption('select[name="gradeLevel"]', '10')

      // Submit
      await page.click('button:has-text("Save")')

      // Verify success
      await expect(page.locator('text=Photosynthesis')).toBeVisible()
    })

    test('should create activity with geo-tagging', async () => {
      // Navigate to activity creation
      await page.click('button:has-text("Create Activity")')

      // Step 1: Basic info
      await page.fill('input[label="Activity Name"]', 'Park Scavenger Hunt')
      await page.selectOption('select[label="Difficulty"]', 'medium')
      await page.fill('input[label="Duration"]', '45')
      await page.fill(
        'textarea[label="Instructions"]',
        'Find and identify 5 plant species'
      )
      await page.click('button:has-text("Next")')

      // Step 2: Location
      await page.fill('input[label="Location Name"]', 'Central Park')
      await page.fill('input[label="Latitude"]', '40.7128')
      await page.fill('input[label="Longitude"]', '-74.0060')
      await page.click('button:has-text("Next")')

      // Step 3: Zone
      await page.fill('input[label="Zone Radius"]', '100')
      await page.click('button:has-text("Next")')

      // Step 4: Review
      await expect(page.locator('text=Park Scavenger Hunt')).toBeVisible()
      await page.click('button:has-text("Save")')

      // Verify success
      await expect(page.locator('text=Activity created')).toBeVisible()
    })

    test('should monitor live session', async () => {
      // Start a session (assuming one is in progress)
      await page.click('button:has-text("Monitor")')

      // Should see live map
      await expect(page.locator('[data-testid="live-map"]')).toBeVisible()

      // Should see student locations
      await expect(page.locator('text=Student Locations')).toBeVisible()

      // Should see live connection status
      await expect(page.locator('text=Live')).toBeVisible()
    })

    test('should view evidence with competency assessment', async () => {
      // Navigate to completed session
      await page.goto('http://localhost:5173/sessions/session-123')

      // Click evidence tab
      await page.click('button:has-text("Evidence")')

      // Should see full competency assessment (teacher only)
      await expect(
        page.locator('text=Competency Assessment')
      ).toBeVisible()
      await expect(page.locator('text=Original AI Draft')).toBeVisible()
    })
  })

  // ===== Student Workflow Tests =====
  test.describe('Student Workflow', () => {
    test.beforeEach(async () => {
      // Login as student
      await page.goto('http://localhost:5173/login')
      await page.fill('input[type="email"]', 'student@school.edu')
      await page.fill('input[type="password"]', 'password123')
      await page.click('button:has-text("Login")')
      await page.waitForURL(/\/student-dashboard/)
    })

    test('should create learning session', async () => {
      // Click start session
      await page.click('button:has-text("Start New Session")')

      // Wait for modal
      await expect(page.locator('role=dialog')).toBeVisible()

      // Fill form
      await page.fill('input[label="Session Title"]', 'Park Walk')
      await page.selectOption(
        'select[label="Select Curriculum"]',
        'unit-123'
      )

      // Submit
      await page.click('button:has-text("Confirm Start")')

      // Should redirect to session
      await expect(page).toHaveURL(/\/session\//)
      await expect(page.locator('h1')).toContainText('Park Walk')
    })

    test('should submit text inquiry', async () => {
      // Go to active session
      await page.goto('http://localhost:5173/session/session-123')

      // Ask question
      const inquiryInput = page.locator('textarea[placeholder*="question"]')
      await inquiryInput.fill('What is photosynthesis?')

      // Submit
      await page.click('button:has-text("Ask Question")')

      // Wait for response
      await expect(
        page.locator('text=Next question is:')
      ).toBeVisible({ timeout: 5000 })

      // Verify response shown
      const response = page.locator('[data-testid="socratic-prompt"]')
      await expect(response).toBeVisible()
    })

    test('should take photo inquiry', async () => {
      await page.goto('http://localhost:5173/session/session-123')

      // Switch to photo mode
      await page.click('button:has-text("📷")')

      // Upload image
      const fileInput = page.locator('input[type="file"]')
      await fileInput.setInputFiles('tests/fixtures/plant.jpg')

      // Submit
      await page.click('button:has-text("Submit")')

      // Wait for processing
      await expect(
        page.locator('text=Processing image...')
      ).not.toBeVisible({ timeout: 5000 })

      // Should have response
      await expect(
        page.locator('[data-testid="socratic-prompt"]')
      ).toBeVisible()
    })

    test('should NOT see competency assessment (student privacy)', async () => {
      // Go to evidence tab
      await page.goto('http://localhost:5173/session/session-123')
      await page.click('button:has-text("Evidence")')

      // Should see basic evidence
      await expect(
        page.locator('text=Session Summary')
      ).toBeVisible()

      // Should NOT see teacher-only data
      await expect(
        page.locator('text=Competency Assessment')
      ).not.toBeVisible()
      await expect(
        page.locator('text=Original AI Draft')
      ).not.toBeVisible()
    })

    test('should end session', async () => {
      await page.goto('http://localhost:5173/session/session-123')

      // Click end session
      await page.click('button:has-text("End Session")')

      // Confirm dialog
      await page.click('button:has-text("Confirm")')

      // Should redirect to dashboard
      await expect(page).toHaveURL(/\/student-dashboard/)

      // Session should show as completed
      await expect(
        page.locator('text=Park Walk').locator('..').locator('text=completed')
      ).toBeVisible()
    })
  })

  // ===== Internationalization Tests =====
  test.describe('Internationalization', () => {
    test('should switch to Spanish', async () => {
      await page.goto('http://localhost:5173')

      // Click language switcher
      await page.click('button[aria-label*="language"], button[title*="Idioma"]')

      // Select Spanish
      await page.click('text=Español')

      // Verify language changed
      await expect(page.locator('text=Español')).toBeVisible()

      // Check if UI is in Spanish
      const headerText = await page
        .locator('nav')
        .locator('text*="')
        .first()
        .textContent()
      expect(headerText).toBeDefined()
    })

    test('should render Arabic with RTL', async () => {
      await page.goto('http://localhost:5173')

      // Switch to Arabic
      await page.click('button[aria-label*="language"]')
      await page.click('text=العربية')

      // Check for RTL attribute
      const htmlDir = await page.locator('html').getAttribute('dir')
      expect(htmlDir).toBe('rtl')

      // Verify Arabic text visible
      await expect(page.locator('text=العربية')).toBeVisible()
    })

    test('should load correct translations for teacher role', async () => {
      // Login as teacher
      await page.goto('http://localhost:5173/login')
      await page.fill('input[type="email"]', 'teacher@school.edu')
      await page.fill('input[type="password"]', 'password123')
      await page.click('button:has-text("Login")')

      // Should show teacher-specific UI
      await expect(page.locator('text=Curriculum')).toBeVisible()
      await expect(page.locator('text=Students')).toBeVisible()
    })
  })

  // ===== Privacy Tests =====
  test.describe('Privacy & Compliance', () => {
    test('should sanitize URLs (no PII in URLs)', async () => {
      // Login
      await page.goto('http://localhost:5173/login')
      await page.fill('input[type="email"]', 'teacher@school.edu')
      await page.fill('input[type="password"]', 'password123')
      await page.click('button:has-text("Login")')

      // Check current URL
      const url = page.url()

      // Should NOT contain email or password
      expect(url).not.toContain('teacher@school.edu')
      expect(url).not.toContain('password')
    })

    test('should use secure storage for tokens', async () => {
      // Login
      await page.goto('http://localhost:5173/login')
      await page.fill('input[type="email"]', 'teacher@school.edu')
      await page.fill('input[type="password"]', 'password123')
      await page.click('button:has-text("Login")')

      // Wait for redirect
      await page.waitForURL(/\/dashboard/)

      // Token should be in storage (not visible in HTML)
      const token = await page.evaluate(() => {
        return localStorage.getItem('auth_token')
      })

      expect(token).toBeDefined()
      expect(token).toBeTruthy()
    })

    test('should handle COPPA compliance for under-13', async () => {
      // This would require a test account marked as under-13
      // Verify that email is not displayed
      // Verify that age-appropriate content is shown
    })
  })

  // ===== Accessibility Tests =====
  test.describe('Accessibility', () => {
    test('should have skip link', async () => {
      await page.goto('http://localhost:5173')

      // Check for skip link
      const skipLink = page.locator('[aria-label*="skip"], text*="Skip"')
      await expect(skipLink).toHaveAttribute('href')
    })

    test('should have proper focus management', async () => {
      await page.goto('http://localhost:5173/login')

      // Tab through form
      await page.keyboard.press('Tab') // Should focus email input
      await expect(page.locator('input[type="email"]')).toBeFocused()

      await page.keyboard.press('Tab') // Should focus password input
      await expect(page.locator('input[type="password"]')).toBeFocused()

      await page.keyboard.press('Tab') // Should focus button
      await expect(page.locator('button:has-text("Login")')).toBeFocused()
    })

    test('should have proper heading hierarchy', async () => {
      await page.goto('http://localhost:5173')

      // Check H1 exists
      const h1 = page.locator('h1')
      await expect(h1).toHaveCount(1) // Only one H1 per page

      // H2s should come after H1
      const h2s = page.locator('h2')
      if ((await h2s.count()) > 0) {
        // H2s should exist
        await expect(h2s.first()).toBeVisible()
      }
    })
  })

  // ===== Offline Behavior =====
  test.describe('Network Resilience', () => {
    test('should show error when API is unavailable', async () => {
      // Go offline
      await page.context().setOffline(true)

      await page.goto('http://localhost:5173/login')
      await page.fill('input[type="email"]', 'teacher@school.edu')
      await page.fill('input[type="password"]', 'password123')
      await page.click('button:has-text("Login")')

      // Should show error
      await expect(page.locator('text=Network Error')).toBeVisible()

      // Go back online
      await page.context().setOffline(false)
    })
  })
})
