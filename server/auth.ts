import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { OAuth2Client } from "google-auth-library";

const JWT_SECRET = process.env.JWT_SECRET || "fallback-dev-secret";
const JWT_EXPIRY = "7d";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

export interface AuthPayload {
  teacherId: number;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      teacher?: AuthPayload;
    }
  }
}

export async function verifyGoogleToken(idToken: string): Promise<{ email: string; name: string; googleId: string } | null> {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) return null;
    return {
      email: payload.email,
      name: payload.name || payload.email,
      googleId: payload.sub,
    };
  } catch {
    return null;
  }
}

export function generateToken(teacherId: number, email: string, role: string): string {
  return jwt.sign({ teacherId, email, role }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.authToken || req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  req.teacher = payload;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.teacher) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  if (req.teacher.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  next();
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.authToken || req.headers.authorization?.replace("Bearer ", "");

  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.teacher = payload;
    }
  }
  next();
}
