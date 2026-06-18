// DriftLens - Skill file reader

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';

export async function readSkillFile(filepath: string): Promise<string> {
  if (!existsSync(filepath)) return '';
  return readFile(filepath, 'utf8');
}
