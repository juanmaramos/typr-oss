import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";

const languageLabels = {
  "Arabic": msg`Arabic`,
  "Azerbaijani": msg`Azerbaijani`,
  "Bosnian": msg`Bosnian`,
  "Bulgarian": msg`Bulgarian`,
  "Catalan": msg`Catalan`,
  "Croatian": msg`Croatian`,
  "Czech": msg`Czech`,
  "Danish": msg`Danish`,
  "Dutch": msg`Dutch`,
  "English": msg`English`,
  "Estonian": msg`Estonian`,
  "Filipino": msg`Filipino`,
  "Finnish": msg`Finnish`,
  "French": msg`French`,
  "Galician": msg`Galician`,
  "German": msg`German`,
  "Greek": msg`Greek`,
  "Hindi": msg`Hindi`,
  "Hungarian": msg`Hungarian`,
  "Indonesian": msg`Indonesian`,
  "Italian": msg`Italian`,
  "Japanese": msg`Japanese`,
  "Korean": msg`Korean`,
  "Latvian": msg`Latvian`,
  "Macedonian": msg`Macedonian`,
  "Malay": msg`Malay`,
  "Mandarin": msg`Mandarin`,
  "Mandarin Chinese": msg`Mandarin Chinese`,
  "Norwegian": msg`Norwegian`,
  "Polish": msg`Polish`,
  "Portuguese": msg`Portuguese`,
  "Romanian": msg`Romanian`,
  "Russian": msg`Russian`,
  "Serbian": msg`Serbian`,
  "Slovak": msg`Slovak`,
  "Slovenian": msg`Slovenian`,
  "Spanish": msg`Spanish`,
  "Swedish": msg`Swedish`,
  "Tamil": msg`Tamil`,
  "Thai": msg`Thai`,
  "Turkish": msg`Turkish`,
  "Ukrainian": msg`Ukrainian`,
  "Urdu": msg`Urdu`,
  "Vietnamese": msg`Vietnamese`,
};

export function getLanguageLabel(language: string): string {
  const descriptor = languageLabels[language as keyof typeof languageLabels];
  return descriptor ? i18n._(descriptor) : language;
}

/** Locale-aware names for ISO language codes supplied by language metadata. */
export function getLanguageName(code: string): string {
  return new Intl.DisplayNames([i18n.locale || "en"], { type: "language" }).of(code) ?? code;
}
