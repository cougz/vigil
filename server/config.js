import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const DATA_PATH = process.env.DATA_PATH ?? join(process.cwd(), '..', 'data')

let fileConfig = {}
const configFile = join(DATA_PATH, 'config.json')
if (existsSync(configFile)) {
  try {
    fileConfig = JSON.parse(readFileSync(configFile, 'utf8'))
  } catch (err) {
    console.error(`Failed to parse ${configFile}: ${err.message}`)
  }
}

const config = Object.freeze({
  port:     parseInt(process.env.PORT ?? '3000', 10),
  host:     process.env.HOST ?? '0.0.0.0',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  dataPath: DATA_PATH,
  nodeEnv:  process.env.NODE_ENV ?? 'development',
  ...fileConfig,
})

export default config
