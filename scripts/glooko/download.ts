import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

type DownloadOptions = {
  login?: boolean
}

export async function downloadExport(options: DownloadOptions = {}) {
  const rootDir = process.cwd()
  const authDir = process.env.GLOOKO_AUTH_DIR ?? join(rootDir, 'scripts/glooko/.auth')
  const downloadsDir = process.env.GLOOKO_DOWNLOAD_DIR ?? join(rootDir, 'scripts/glooko/downloads')
  const storageStatePath = join(authDir, 'storage-state.json')
  const url = process.env.GLOOKO_URL ?? 'https://my.glooko.com'
  const hasSavedSession = existsSync(join(authDir, 'Default'))
  const headless = process.env.GLOOKO_HEADLESS === 'true' && !options.login && hasSavedSession

  mkdirSync(authDir, { recursive: true })
  mkdirSync(downloadsDir, { recursive: true })

  const context = await chromium.launchPersistentContext(authDir, {
    acceptDownloads: true,
    downloadsPath: downloadsDir,
    headless,
  })

  try {
    if (existsSync(storageStatePath)) {
      const state = JSON.parse(await readFile(storageStatePath, 'utf8'))
      if (Array.isArray(state.cookies)) await context.addCookies(state.cookies)
    }

    const page = context.pages()[0] ?? await context.newPage()
    await page.goto(url, { waitUntil: 'domcontentloaded' })

    if (options.login || !hasSavedSession || isSignInUrl(page.url())) {
      await completeLogin(page)
    }

    const download = await triggerExport(page, downloadsDir)
    const suggested = download.suggestedFilename()
    const savedPath = join(downloadsDir, suggested)
    await download.saveAs(savedPath)
    await context.storageState({ path: storageStatePath })
    return savedPath
  } finally {
    await context.close()
  }
}

async function completeLogin(page: import('playwright').Page) {
  const email = process.env.GLOOKO_EMAIL
  const password = process.env.GLOOKO_PASSWORD

  if (email) {
    const emailInput = page.getByLabel(/email|username/i).or(page.locator('input[type="email"], input[name*="email" i], input[name*="username" i]').first())
    await emailInput.fill(email).catch(() => undefined)
  }

  if (password) {
    const passwordInput = page.getByLabel(/password/i).or(page.locator('input[type="password"]').first())
    await passwordInput.fill(password).catch(() => undefined)
  }

  if (email || password) {
    await page.getByRole('button', { name: /log in|sign in|continue/i }).click().catch(() => undefined)
  }

  console.log('Complete Glooko login in the opened browser if needed. Waiting for an authenticated page...')
  await page.waitForURL(url => !/login|sign[_-]?in/i.test(url.toString()), { timeout: 180_000 })
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => undefined)
}

function isSignInUrl(url: string) {
  return /login|sign[_-]?in/i.test(url)
}

async function triggerExport(page: import('playwright').Page, downloadsDir: string) {
  const exportUrl = process.env.GLOOKO_EXPORT_URL
  if (exportUrl) await page.goto(exportUrl, { waitUntil: 'domcontentloaded' })

  const configuredSelector = process.env.GLOOKO_EXPORT_SELECTOR
  const trigger = configuredSelector
    ? page.locator(configuredSelector).first()
    : page.getByRole('button', { name: /export.*csv|csv.*export|download.*csv/i }).first()
      .or(page.getByRole('link', { name: /export.*csv|csv.*export|download.*csv/i }))
      .or(page.getByText(/export.*csv|csv.*export|download.*csv/i))
      .first()

  try {
    await trigger.click({ timeout: 30_000 })
    await page.getByRole('dialog').getByRole('button', { name: /^Export$/i }).click({ timeout: 30_000 })
    return await page.waitForEvent('download', { timeout: 120_000 })
  } catch (error) {
    const screenshotPath = join(downloadsDir, `glooko-export-failed-${Date.now()}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined)
    throw new Error(`Could not start Glooko CSV export from ${page.url()}. Screenshot: ${screenshotPath}. ${error}`)
  }
}
