export type Locale = "zh-CN" | "en";

export const SUPPORTED_LOCALES: Locale[] = ["zh-CN", "en"];
export const DEFAULT_LOCALE: Locale = "zh-CN";

/** 跨组件共享的翻译存储 key */
export const STORAGE_KEY = "magicsniffer-locale";
