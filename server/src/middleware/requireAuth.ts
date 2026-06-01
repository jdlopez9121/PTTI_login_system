import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthPayload {
  teacherId: string
  email: string
}

declare global {
  namespace Express {
    interface Request {
      teacher?: AuthPayload
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.token as string | undefined
  if (!token) {
    res.status(401).json({ success: false, error: 'Not authenticated' })
    return
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET ?? 'dev-secret') as AuthPayload
    req.teacher = payload
    next()
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired session' })
  }
}
