import 'dotenv/config';

interface Config {
  port: number;
  jwtSecret: string;
  jwtExpiresIn: string;
  dbPath: string;
  logLevel: string;
}

export const config: Config = {
  port: parseInt(process.env.PORT || '4000', 10),
  jwtSecret: process.env.JWT_SECRET || 'default-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  dbPath: process.env.DB_PATH || './data/game.db',
  logLevel: process.env.LOG_LEVEL || 'info',
};
