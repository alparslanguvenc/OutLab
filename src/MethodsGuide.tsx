import { useLang } from "./i18n";
import type { GuideSection } from "./OptionalMethods";

export function MethodsGuide({
  section,
}: {
  section: GuideSection;
  onSection: (s: GuideSection) => void;
}) {
  useLang();
  return <div data-section={section} />;
}
