import 'dotenv/config';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { join } from 'path';
import { readFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const dbPath = join(process.cwd(), './data/game.db');
mkdirSync(dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const schemaPath = join(__dirname, 'schema.sql');
const schema = readFileSync(schemaPath, 'utf-8');
db.exec(schema);

function createInitialInviteCodes() {
  const existingCodes = db.prepare('SELECT COUNT(*) as count FROM invite_codes').get() as {
    count: number;
  };
  if (existingCodes.count > 0) {
    console.log('Invite codes already exist');
    return;
  }

  const codes: string[] = [];
  for (let i = 0; i < 5; i++) {
    const code = uuidv4().slice(0, 8).toUpperCase();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO invite_codes (code, created_at) VALUES (?, ?)').run(code, now);
    codes.push(code);
  }

  console.log('Created initial invite codes:');
  codes.forEach((code) => console.log(`  ${code}`));
}

createInitialInviteCodes();
