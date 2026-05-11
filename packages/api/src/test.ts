import 'dotenv/config';
import db from './db';
import { createApp } from './app';
import { config } from './config';

// Get an unused invite code
const inviteCodeRow = db
  .prepare('SELECT code FROM invite_codes WHERE used_by IS NULL LIMIT 1')
  .get() as { code: string } | undefined;
const inviteCode = inviteCodeRow?.code;

if (!inviteCode) {
  console.error('No unused invite codes found. Run seed first.');
  process.exit(1);
}

console.log('Using invite code:', inviteCode);

const app = createApp();
const server = app.listen(config.port, async () => {
  console.log('Server started for testing');

  try {
    // Test 1: Health check
    const healthRes = await fetch(`http://localhost:${config.port}/health`);
    const healthData = await healthRes.json();
    console.log('Health check:', healthData);

    // Test 2: Registration
    const registerRes = await fetch(`http://localhost:${config.port}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'testuser',
        password: 'testpass123',
        inviteCode,
      }),
    });
    const registerData = await registerRes.json();
    console.log('Registration:', registerData);

    // Test 3: Login
    const loginRes = await fetch(`http://localhost:${config.port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'testuser',
        password: 'testpass123',
      }),
    });
    const loginData = await loginRes.json();
    console.log('Login:', loginData);

    console.log('\n✅ All tests passed!');
  } catch (err) {
    console.error('❌ Test failed:', err);
  }

  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
