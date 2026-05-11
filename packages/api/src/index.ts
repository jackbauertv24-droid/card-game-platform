import 'dotenv/config';
import { createApp, startServer } from './app';
import { config } from './config';

console.log('Starting Card Game Platform API...');
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`Port: ${config.port}`);

const app = createApp();
startServer(app);

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down...');
  process.exit(0);
});
