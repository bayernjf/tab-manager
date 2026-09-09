/**
 * DOM and messaging primitives shared by board.ts and the dialog modules it
 * delegates to. Nothing here may import those modules back, so that the
 * dialogs can depend on board.ts's helpers without an import cycle.
 */

export const $ = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
};

export async function send<T>(message: unknown): Promise<T> {
  const response = await chrome.runtime.sendMessage(message) as T & { error?: string };
  if (response?.error) throw new Error(response.error);
  return response;
}

export function boardToast(message: string, error = false, anchor?: HTMLElement): HTMLParagraphElement {
  const toast = document.createElement("p");
  toast.className = `board-toast ${error ? "error" : "success"}`;
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.textContent = message;
  document.body.append(toast);
  if (anchor) {
    const rect = anchor.getBoundingClientRect();
    const margin = 6;
    toast.style.maxWidth = `${Math.min(280, window.innerWidth - margin * 2)}px`;
    const toastWidth = toast.offsetWidth;
    const isCardHeading = anchor.classList.contains("card-title") || anchor.closest(".card-title") !== null;
    let left: number;
    if (isCardHeading) {
      left = Math.max(margin, Math.min(rect.left + rect.width / 2 - toastWidth / 2, window.innerWidth - toastWidth - margin));
    } else {
      left = Math.max(margin, Math.min(rect.right - toastWidth, window.innerWidth - toastWidth - margin));
    }
    const top = Math.max(margin, rect.top - toast.offsetHeight - 4);
    toast.style.top = `${top}px`;
    toast.style.left = `${left}px`;
  } else {
    toast.style.top = "20px";
    toast.style.left = "50%";
    toast.style.transform = "translateX(-50%)";
  }
  window.setTimeout(() => { toast.remove(); }, 2200);
  return toast;
}

export function showStatus(message: string, error = false): void {
  boardToast(message, error);
}

export function makeButton(label: string, className: string, title: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.textContent = label;
  return button;
}

export function faviconFor(url?: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return `${parsed.origin}/favicon.ico`;
  } catch {
    return "";
  }
}

export async function getOpenTabUrls(): Promise<Set<string>> {
  try {
    const tabs = await chrome.tabs.query({});
    return new Set(tabs.map((tab) => tab.url).filter((url): url is string => typeof url === "string"));
  } catch { return new Set(); }
}
