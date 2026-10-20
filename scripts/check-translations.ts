import en from '../src/i18n/en.json';
import ro from '../src/i18n/ro.json';

const englishKeys = Object.keys(en).sort();
const romanianKeys = Object.keys(ro).sort();
const missingRomanian = englishKeys.filter(key => !romanianKeys.includes(key));
const missingEnglish = romanianKeys.filter(key => !englishKeys.includes(key));
if (missingRomanian.length || missingEnglish.length) {
  console.error(JSON.stringify({ missingRomanian, missingEnglish }, null, 2));
  process.exitCode = 1;
} else {
  console.log(`Translation key parity passed: ${englishKeys.length} keys.`);
}
