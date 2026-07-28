export const i18n = {
  t(key: string, substitutions?: string[]): string {
    try {
      if (typeof chrome !== 'undefined' && chrome.i18n) {
        return chrome.i18n.getMessage(key, substitutions) || key;
      }
    } catch {
    }
    return key;
  },

  getUILanguage(): string {
    try {
      if (typeof chrome !== 'undefined' && chrome.i18n) {
        return chrome.i18n.getUILanguage();
      }
    } catch {
    }
    return navigator.language || 'zh_CN';
  },

  detectLanguage(): 'zh_CN' | 'en' {
    const uiLang = this.getUILanguage();
    if (uiLang.startsWith('zh')) {
      return 'zh_CN';
    }
    return 'en';
  },

  applyI18n(): void {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach((element) => {
      const key = element.getAttribute('data-i18n');
      if (!key) return;

      const attrMatch = key.match(/^([^|]+)\|([a-z]+)$/);
      const actualKey = attrMatch ? attrMatch[1]! : key;
      const attrName = attrMatch ? attrMatch[2]! : 'textContent';

      const text = this.t(actualKey);
      if (attrName === 'textContent') {
        (element as HTMLElement).textContent = text;
      } else if (attrName === 'placeholder') {
        (element as HTMLInputElement).placeholder = text;
      } else if (attrName === 'title') {
        element.setAttribute('title', text);
      } else if (attrName === 'aria-label') {
        element.setAttribute('aria-label', text);
      } else if (attrName === 'alt') {
        element.setAttribute('alt', text);
      }
    });
  }
};