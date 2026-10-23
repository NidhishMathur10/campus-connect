import { ImageResponse } from "next/og";
import { APP_NAME, COLLEGE_NAME } from "@/config/college";

// Link-preview card (WhatsApp, Slack, ...). Colours are fixed here: image rendering cannot use CSS variables.
export const alt = `${APP_NAME} — Every campus complaint, tracked to resolution`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const NAVY = "#0F172A"; // theme-ok
const WHITE = "#FFFFFF"; // theme-ok
const BLUE = "#3B82F6"; // theme-ok
const SKY = "#7DD3FC"; // theme-ok

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: NAVY,
          color: WHITE,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg width="96" height="96" viewBox="0 0 40 40" fill="none">
            <circle cx="27" cy="14" r="9.5" stroke={BLUE} strokeWidth="3" />
            <path
              d="M6 13.5C6 9.36 9.36 6 13.5 6h7C24.64 6 28 9.36 28 13.5v5c0 4.14-3.36 7.5-7.5 7.5H15l-6.2 5.3c-.65.55-1.6.09-1.6-.75V25.2A7.48 7.48 0 0 1 6 21.5v-8Z"
              fill={WHITE}
            />
            <path d="m11.5 16.2 3.4 3.3 6.6-6.6" stroke={NAVY} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ fontSize: 56, fontWeight: 800 }}>{APP_NAME}</div>
        </div>
        <div style={{ marginTop: 56, fontSize: 76, fontWeight: 800, lineHeight: 1.1, maxWidth: 980 }}>
          Every campus complaint, tracked to resolution
        </div>
        <div style={{ marginTop: 36, fontSize: 32, color: SKY }}>
          {`Hindi + English · AI-routed tickets · Live tracking · ${COLLEGE_NAME}`}
        </div>
      </div>
    ),
    size,
  );
}
