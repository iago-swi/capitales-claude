/**
 * Loads capitals.json into the countries table. Idempotent.
 * Needs nothing running: it opens the database file directly.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Country } from '@capitales/core';
import { countCountries, openDb, seedCountries } from './db.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const DB_PATH = path.join(ROOT, '.data', 'capitales.db');
const CAPITALS = path.join(ROOT, 'packages', 'data', 'capitals.json');

mkdirSync(path.dirname(DB_PATH), { recursive: true });

const countries = JSON.parse(readFileSync(CAPITALS, 'utf8')) as Country[];
const db = openDb(DB_PATH);
const written = seedCountries(db, countries);

console.log(`seeded ${written}, table now holds ${countCountries(db)}`);
db.close();
