import type { Response } from 'express'
import type { ApiError, ApiSuccess } from '../types/api.types'

export function sendOk<T>(res: Response, data: T, message?: string, status = 200): void {
  const body: ApiSuccess<T> = { ok: true, data }
  if (message) body.message = message
  res.status(status).json(body)
}

export function sendErr(
  res: Response,
  message: string,
  status = 400,
  code?: string,
  solutions?: string[],
): void {
  const body: ApiError = { ok: false, message }
  if (code) body.code = code
  if (solutions?.length) body.solutions = solutions
  res.status(status).json(body)
}
