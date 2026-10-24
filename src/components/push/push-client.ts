"use client";

import { isPushSubscriptionSaved, removePushSubscription, savePushSubscription } from "@/lib/push/actions";

/** Browser-side helpers for the installable app + Web Push (server side: src/lib/push). */

export type PushState =
  | "checking"
  | "unsupported" // this browser cannot do push at all
  | "needs-install" // iPhone / iPad: push only works once the app is on the Home Screen
  | "not-configured" // the server has no VAPID key
  | "blocked" // notifications blocked in browser settings
  | "off"
  | "on";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac with a touch screen.
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return Promise.resolve(null);
  return navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
    console.error("[push] service worker", err);
    return null;
  });
}

// ---------------------------------------------------------------------------
// Android / desktop Chrome "Install app" prompt. The event fires once, early, so it is captured globally.
// ---------------------------------------------------------------------------
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: InstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
const emitInstall = () => installListeners.forEach((fn) => fn());

export function captureInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as InstallPromptEvent;
    emitInstall();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    emitInstall();
  });
}

export const canPromptInstall = () => deferredPrompt !== null;

export function onInstallChange(fn: () => void): () => void {
  installListeners.add(fn);
  return () => installListeners.delete(fn);
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  const ev = deferredPrompt;
  deferredPrompt = null;
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  emitInstall();
  return outcome === "accepted";
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = (await navigator.serviceWorker.getRegistration("/")) ?? (await registerServiceWorker());
  if (!reg) return null;
  await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

const hasPushApi = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** What the toggle should show right now for the signed-in user on this device. */
export async function readPushState(): Promise<PushState> {
  if (!hasPushApi()) return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  if (!PUBLIC_KEY) return "not-configured";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted") return "off";
  try {
    const sub = await currentSubscription();
    // "On" only if the server also knows this exact device for this user (a shared phone may belong to someone else's login).
    return sub && (await isPushSubscriptionSaved(sub.endpoint)) ? "on" : "off";
  } catch {
    return "off";
  }
}

/** Asks permission, subscribes this device and saves it. Returns the new state or an error message. */
export async function enablePush(): Promise<{ state: PushState; error?: string }> {
  if (!hasPushApi()) return { state: await readPushState() };
  if (!PUBLIC_KEY) return { state: "not-configured" };
  const permission = await Notification.requestPermission();
  if (permission === "denied") return { state: "blocked" };
  if (permission !== "granted") return { state: "off" };

  try {
    const reg = (await navigator.serviceWorker.getRegistration("/")) ?? (await registerServiceWorker());
    if (!reg) return { state: "off", error: "Could not start the app service. Please reload and try again." };
    await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY) }));
    const res = await savePushSubscription(sub.toJSON(), navigator.userAgent);
    if (!res.ok) return { state: "off", error: res.error };
    return { state: "on" };
  } catch (err) {
    console.error("[push] subscribe", err);
    return { state: "off", error: "This phone could not turn on alerts. Please try again." };
  }
}

/** Turns alerts off for this device (server row removed, browser subscription dropped). */
export async function disablePush(): Promise<{ state: PushState; error?: string }> {
  try {
    const sub = await currentSubscription();
    if (sub) {
      const res = await removePushSubscription(sub.endpoint);
      if (!res.ok) return { state: "on", error: res.error };
      await sub.unsubscribe();
    }
    return { state: "off" };
  } catch (err) {
    console.error("[push] unsubscribe", err);
    return { state: "on", error: "Could not turn alerts off. Please try again." };
  }
}

/** Called on sign-out so the next person on a shared phone does not receive this person's alerts. */
export async function forgetThisDevice(): Promise<void> {
  try {
    if (!hasPushApi()) return;
    const sub = await Promise.race([currentSubscription(), new Promise<null>((r) => setTimeout(() => r(null), 1500))]);
    if (sub) {
      await removePushSubscription(sub.endpoint);
      await sub.unsubscribe();
    }
  } catch {
    /* signing out must never fail because of this */
  }
}
