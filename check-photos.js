#!/usr/bin/env node
/**
 * check-photos.js
 *
 * Локальная проверка перед коммитом/пушем: сверяет photos.json (портфолио)
 * и hero.json (карусель на главной) с реальными файлами в папке photos/,
 * чтобы фото на сайте не "молча" пропадали (index.html скрывает битые
 * <img> через onerror).
 *
 * Запуск:
 *   node check-photos.js
 *
 * Код выхода: 0 — всё ок, 1 — найдены проблемы (удобно для git hook / CI).
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PHOTOS_JSON = path.join(ROOT, 'photos.json');
const HERO_JSON = path.join(ROOT, 'hero.json');
const PHOTOS_DIR = path.join(ROOT, 'photos');

// Категории портфолио (masonry-грид), реально используемые в index.html.
const KNOWN_PORTFOLIO_CATEGORIES = ['mariage', 'gala', 'tv', 'shooting'];

let errors = 0;
let warnings = 0;
const referenced = new Set(); // "category/file" — чтобы не путать с "не используется"

function fail(msg) { console.log(`  ✗ ${msg}`); errors++; }
function warn(msg) { console.log(`  ! ${msg}`); warnings++; }
function ok(msg)   { console.log(`  ✓ ${msg}`); }

function readJson(file, label) {
  if (!fs.existsSync(file)) {
    fail(`${label} не найден: ${path.basename(file)}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    fail(`${label} содержит невалидный JSON: ${e.message}`);
    return null;
  }
}

function checkFileExists(category, file, label) {
  const dir = path.join(PHOTOS_DIR, category);
  const expectedPath = path.join(dir, file);

  if (!fs.existsSync(expectedPath)) {
    fail(`${label}: файл не найден по пути photos/${category}/${file}`);
    return false;
  }

  // Точная проверка регистра (Mac не различает регистр в путях, Netlify — различает)
  const dirEntries = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  if (!dirEntries.includes(file)) {
    fail(`${label}: регистр не совпадает — на диске нет файла с точным именем "${file}" в папке "${category}" (проверьте .JPG vs .jpg)`);
    return false;
  }

  ok(`${label}: photos/${category}/${file}`);
  referenced.add(`${category}/${file}`);
  return true;
}

// ── 1. photos.json (портфолио) ──
console.log('── Проверка photos.json (портфолио) ──\n');

const photos = readJson(PHOTOS_JSON, 'photos.json');
if (photos) {
  if (!Array.isArray(photos) || photos.length === 0) {
    fail('photos.json пуст или не является массивом');
  } else {
    console.log(`Проверяю ${photos.length} запис${photos.length === 1 ? 'ь' : 'и/ей'}...\n`);
    photos.forEach((p, i) => {
      const label = `#${i + 1} (${p.file || '?'})`;
      if (!p.file)     { fail(`${label}: отсутствует поле "file"`); return; }
      if (!p.category) { fail(`${label}: отсутствует поле "category"`); return; }
      if (p.category === 'hero') {
        warn(`${label}: категория "hero" в photos.json больше не используется — фото для карусели теперь описываются в hero.json`);
      } else if (!KNOWN_PORTFOLIO_CATEGORIES.includes(p.category)) {
        warn(`${label}: категория "${p.category}" не встречается в index.html (известные: ${KNOWN_PORTFOLIO_CATEGORIES.join(', ')})`);
      }
      checkFileExists(p.category, p.file, label);
    });
  }
}

// ── 2. hero.json (карусель на главной) ──
console.log('\n── Проверка hero.json (карусель) ──\n');

const hero = readJson(HERO_JSON, 'hero.json');
if (hero) {
  if (!Array.isArray(hero) || hero.length === 0) {
    fail('hero.json пуст или не является массивом');
  } else {
    console.log(`Проверяю ${hero.length} слайд${hero.length === 1 ? '' : 'ов'}...\n`);
    hero.forEach((s, i) => {
      const label = `Слайд #${i + 1} (${s.category || '?'})`;
      if (!s.file) {
        warn(`${label}: фото не задано (file: null) — покажется заглушка-иконка вместо фото`);
        return;
      }
      checkFileExists('hero', s.file, label);
    });
  }
}

// ── 3. Файлы в photos/, на которые никто не ссылается ──
console.log('\n── Файлы без ссылок в photos.json / hero.json ──\n');

if (fs.existsSync(PHOTOS_DIR)) {
  const categories = fs.readdirSync(PHOTOS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  categories.forEach(cat => {
    const files = fs.readdirSync(path.join(PHOTOS_DIR, cat))
      .filter(f => !f.startsWith('.') && f !== '.gitkeep');

    files.forEach(f => {
      const key = `${cat}/${f}`;
      if (!referenced.has(key)) {
        warn(`photos/${key} лежит на диске, но нигде не подключён (просто не будет показан на сайте)`);
      }
    });
  });
} else {
  fail('Папка photos/ не найдена');
}

// Итог
console.log('\n──────────────────────────────');
if (errors > 0) {
  console.log(`✗ Найдено ошибок: ${errors}${warnings ? `, предупреждений: ${warnings}` : ''}`);
  console.log('Не пушьте, пока не исправите — фото не загрузятся на сайте.\n');
  process.exit(1);
} else if (warnings > 0) {
  console.log(`✓ Ошибок нет, но есть предупреждения: ${warnings}`);
  console.log('Можно пушить.\n');
  process.exit(0);
} else {
  console.log('✓ Всё в порядке — можно пушить.\n');
  process.exit(0);
}
