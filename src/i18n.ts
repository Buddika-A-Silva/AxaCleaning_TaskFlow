import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './i18n/en.json';
import ro from './i18n/ro.json';

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ro: { translation: ro } },
  lng: sessionStorage.getItem('taskflow-language') === 'ro' ? 'ro' : 'en', fallbackLng: 'en', supportedLngs: ['en', 'ro'], interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
