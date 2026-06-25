import 'express-session'

declare module 'express-session' {
  interface SessionData {
    authed?: boolean
    username?: string
  }
}
