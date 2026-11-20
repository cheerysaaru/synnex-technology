/* Document typefaces. Embedded in every PDF so it looks the same everywhere. */
import { Font } from "@react-pdf/renderer";
import ssLight from "./fonts/SourceSans3_300Light.ttf?url";
import ssRegular from "./fonts/SourceSans3_400Regular.ttf?url";
import ssItalic from "./fonts/SourceSans3_400Regular_Italic.ttf?url";
import ssSemi from "./fonts/SourceSans3_600SemiBold.ttf?url";
import ssBold from "./fonts/SourceSans3_700Bold.ttf?url";
import pxLight from "./fonts/IBMPlexSans_300Light.ttf?url";
import pxRegular from "./fonts/IBMPlexSans_400Regular.ttf?url";
import pxItalic from "./fonts/IBMPlexSans_400Regular_Italic.ttf?url";
import pxMedium from "./fonts/IBMPlexSans_500Medium.ttf?url";
import pxBold from "./fonts/IBMPlexSans_700Bold.ttf?url";

let done = false;
export function registerFonts() {
  if (done) return;
  done = true;
  Font.register({
    family: "Source Sans 3",
    fonts: [
      { src: ssLight, fontWeight: 300 },
      { src: ssRegular, fontWeight: 400 },
      { src: ssItalic, fontWeight: 400, fontStyle: "italic" },
      { src: ssSemi, fontWeight: 600 },
      { src: ssBold, fontWeight: 700 },
    ],
  });
  Font.register({
    family: "IBM Plex Sans",
    fonts: [
      { src: pxLight, fontWeight: 300 },
      { src: pxRegular, fontWeight: 400 },
      { src: pxItalic, fontWeight: 400, fontStyle: "italic" },
      { src: pxMedium, fontWeight: 500 },
      { src: pxBold, fontWeight: 700 },
    ],
  });
  // Keep words whole instead of hyphenating them.
  Font.registerHyphenationCallback((word) => [word]);
}
