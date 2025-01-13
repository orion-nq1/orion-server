import { Request, Response, NextFunction } from 'express';

const apiKey = process.env.API_KEY;

export function verifyApiKey(req: Request, res: Response, next: NextFunction) {
    const key = req.headers['x-api-key']; // Expecting the key in the headers
    if (!key) {
      return res.status(401).json({ error: 'API key is missing' });
    }
    if (key !== apiKey) {
      return res.status(403).json({ error: 'Invalid API key' });
    }
    next();
  }
  