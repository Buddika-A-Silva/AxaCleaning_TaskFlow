import en from '../src/i18n/en.json';

const emptyEnglish = Object.entries(en).filter(([, value]) => typeof value !== 'string' || value.trim().length === 0).map(([key]) => key);
if (emptyEnglish.length) {
  console.error(JSON.stringify({ emptyEnglish }, null, 2));
  process.exitCode = 1;
} else {
  console.log(`English translation check passed: ${Object.keys(en).length} keys.`);
}
