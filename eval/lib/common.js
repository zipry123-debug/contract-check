import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EVAL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT_DIR = path.resolve(EVAL_DIR, '..');
export const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

/** --key value / --flag 형태 인자 파싱. 쉼표 값은 배열로. */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    out[key] = typeof val === 'string' && val.includes(',') ? val.split(',') : val;
  }
  return out;
}

export const asList = v => (v === undefined ? undefined : Array.isArray(v) ? v : [v]);

/** server/.dev.vars 읽기. 값은 절대 출력하지 않는다. */
export function loadEnv() {
  const file = path.join(ROOT_DIR, 'server', '.dev.vars');
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

export const readJSON = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
export const writeJSON = (f, data) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(data, null, 2), 'utf8');
};

/** 사진 폴더 아래 제품 폴더 목록: [{ id, dir, images, truth|null }] */
export function listProducts(photoDir, only) {
  if (!fs.existsSync(photoDir)) return [];
  return fs.readdirSync(photoDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && (!only || only.includes(d.name)))
    .map(d => {
      const dir = path.join(photoDir, d.name);
      const images = fs.readdirSync(dir).filter(f => IMAGE_EXT.test(f)).sort();
      const truthFile = path.join(dir, '정답.json');
      return { id: d.name, dir, images, truth: fs.existsSync(truthFile) ? readJSON(truthFile) : null };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

// 정답.json의 photos: { "파일명": 종류 }. 종류별로 채점할 항목이 정해진다.
export const ROLES = {
  nutrition: { nutrition: true, ingredients: false },
  ingredients: { nutrition: false, ingredients: true },
  both: { nutrition: true, ingredients: true },
  barcode: { nutrition: false, ingredients: false },
};

/** 정답에 사진 종류가 있으면 바코드 사진은 빼고 보낸다(할당량 절약). 없으면 전부 보낸다. */
export function imagesToSend(product) {
  const photos = product.truth?.photos;
  // 근로계약서 폴더: 원본.png는 합성_정면.jpg와 같은 내용이라 보내지 않음
  if (!photos) return product.images.filter(img => !/^원본\./.test(img));
  return product.images.filter(img => photos[img] && photos[img] !== 'barcode');
}
