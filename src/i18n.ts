import type { Language } from "./shared.js";

interface MessageEntry {
  message: string;
  description?: string;
  placeholders?: Record<string, { content: string; example?: string }>;
}

type MessageMap = Record<string, MessageEntry>;

let currentLang: Language | undefined;
let currentMessages: MessageMap = {};
let languageLoaded = false;

function interpolate(entry: MessageEntry, substitutions?: string[]): string {
  let message = entry.message;
  if (entry.placeholders) {
    for (const [name, info] of Object.entries(entry.placeholders)) {
      const index = parseInt(info.content.replace(/\$/g, ""), 10) - 1;
      const value = substitutions?.[index] ?? "";
      message = message.split(`$${name}$`).join(value);
    }
  }
  return message;
}

async function loadLanguagePack(lang: Language): Promise<MessageMap> {
  try {
    if (typeof chrome === "undefined" || !chrome.runtime?.getURL) return {};
    const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
    const response = await fetch(url);
    if (!response.ok) return {};
    return (await response.json()) as MessageMap;
  } catch {
    return {};
  }
}

function setI18nText(element: HTMLElement, text: string): void {
  const hasElementChildren = Array.from(element.childNodes).some(
    (node) => node.nodeType === Node.ELEMENT_NODE,
  );
  if (!hasElementChildren) {
    element.textContent = text;
    return;
  }
  const firstText = Array.from(element.childNodes).find(
    (node) => node.nodeType === Node.TEXT_NODE,
  );
  if (firstText) {
    firstText.nodeValue = text;
  } else {
    element.insertBefore(document.createTextNode(text), element.firstChild);
  }
}

export const i18n = {
  t(key: string, substitutions?: string[]): string {
    if (currentMessages[key]) {
      return interpolate(currentMessages[key], substitutions);
    }
    try {
      if (typeof chrome !== "undefined" && chrome.i18n) {
        return chrome.i18n.getMessage(key, substitutions) || key;
      }
    } catch {
    }
    return key;
  },

  getUILanguage(): string {
    try {
      if (typeof chrome !== "undefined" && chrome.i18n) {
        return chrome.i18n.getUILanguage();
      }
    } catch {
    }
    return navigator.language || "zh_CN";
  },

  detectLanguage(): "zh_CN" | "en" {
    if (currentLang) return currentLang;
    const uiLang = this.getUILanguage();
    if (uiLang.startsWith("zh")) {
      return "zh_CN";
    }
    return "en";
  },

  applyI18n(): void {
    const elements = document.querySelectorAll("[data-i18n]");
    elements.forEach((element) => {
      const key = element.getAttribute("data-i18n");
      if (!key) return;

      const attrMatch = key.match(/^([^|]+)\|([a-z-]+)$/);
      const actualKey = attrMatch ? attrMatch[1]! : key;
      const attrName = attrMatch ? attrMatch[2]! : "textContent";

      const text = this.t(actualKey);
      if (attrName === "textContent") {
        setI18nText(element as HTMLElement, text);
      } else if (attrName === "placeholder") {
        (element as HTMLInputElement).placeholder = text;
      } else if (attrName === "title") {
        element.setAttribute("title", text);
      } else if (attrName === "aria-label") {
        element.setAttribute("aria-label", text);
      } else if (attrName === "alt") {
        element.setAttribute("alt", text);
      }
    });
  },

  getCurrentLanguage(): Language | undefined {
    return currentLang;
  },

  isLanguageLoaded(): boolean {
    return languageLoaded;
  },

  async setLanguage(lang: Language | undefined): Promise<void> {
    if (currentLang === lang && languageLoaded) return;
    currentLang = lang;
    if (lang) {
      currentMessages = await loadLanguagePack(lang);
    } else {
      const detected = this.detectLanguage();
      currentMessages = await loadLanguagePack(detected);
    }
    languageLoaded = true;
  },

  async initFromStorage(): Promise<void> {
    try {
      if (typeof chrome === "undefined" || !chrome.storage?.local) return;
      const data = await chrome.storage.local.get("settings");
      const settings = data.settings as { language?: Language } | undefined;
      await this.setLanguage(settings?.language);
    } catch {
      languageLoaded = true;
    }
  },
};
