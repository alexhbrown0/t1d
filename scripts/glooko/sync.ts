import { createClient } from '@supabase/supabase-js'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { importGlookoZip } from '../../lib/glooko/importer'

type Args = {
  file?: string
  download: boolean
  login: boolean
}

loadEnv()

main().catch(error => {
  console.error(error)
  process.exit(1)
})

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const zipPath = args.file ? resolve(args.file) : args.download ? await downloadGlookoExport(args.login) : latestDownload()
  const supabaseUrl = requiredEnv('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const buffer = readFileSync(zipPath)
  const summary = await importGlookoZip(supabase, buffer)

  console.log(JSON.stringify({ file: zipPath, ...summary }, null, 2))
}

async function downloadGlookoExport(login: boolean) {
  const { downloadExport } = await import('./download')
  return downloadExport({ login })
}

function latestDownload() {
  const downloadsDir = getDownloadsDir()
  if (!existsSync(downloadsDir)) {
    throw new Error(`No Glooko downloads directory found at ${downloadsDir}. Run with --download first.`)
  }

  const files = readdirSync(downloadsDir)
    .filter(file => file.toLowerCase().endsWith('.zip'))
    .map(file => join(downloadsDir, file))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)

  if (!files[0]) throw new Error(`No zip exports found in ${downloadsDir}`)
  return files[0]
}

function getDownloadsDir() {
  const dir = process.env.GLOOKO_DOWNLOAD_DIR ?? join(process.cwd(), 'scripts/glooko/downloads')
  mkdirSync(dir, { recursive: true })
  return dir
}

function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function parseArgs(argv: string[]): Args {
  const args: Args = { download: false, login: false }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--file') {
      args.file = argv[++i]
      if (!args.file) throw new Error('Missing path after --file')
    }
    if (arg === '--download') args.download = true
    if (arg === '--login') {
      args.login = true
      args.download = true
    }
  }

  if (args.file && args.download) throw new Error('Use either --file or --download, not both.')
  return args
}

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const path = join(process.cwd(), file)
    if (!existsSync(path)) continue

    const lines = readFileSync(path, 'utf8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      const eq = trimmed.indexOf('=')
      if (eq === -1) continue

      const key = trimmed.slice(0, eq).trim()
      const raw = trimmed.slice(eq + 1).trim()
      if (process.env[key]) continue

      process.env[key] = raw.replace(/^["']|["']$/g, '')
    }
  }
}
