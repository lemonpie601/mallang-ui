/* Mallang 0.3.0 - soft pastel card theme for Marinara Engine v2.5.1.
   Runs as a full_page_access personal extension: this file is the body of an
   async function that receives the `marinara` API. Everything created here is
   removed again in the marinara.onCleanup callback at the bottom. */

const SIZE_QUERIES = {
  phone: "(max-width: 767px)",
  compact: "(min-width: 768px) and (max-width: 1279px)",
  laptop: "(min-width: 1280px) and (max-width: 1599px)",
  wide: "(min-width: 1600px)",
};
const SHORT_QUERY = "(max-height: 760px)";
const NAV_ITEMS = [
  { key: "home", label: "홈", icon: "⌂", selector: '[data-component="TopBar"] [data-topbar-hover-key="home"]' },
  { key: "chats", label: "대화", icon: "✉", selector: '[data-component="TopBar"] [data-topbar-hover-key="chats"]' },
  { key: "characters", label: "서재", icon: "❀", selector: '[data-component="TopBar"] [data-tour="panel-characters"]' },
  { key: "settings", label: "작업실", icon: "✎", selector: '[data-component="TopBar"] [data-tour="panel-settings"]' },
];

const root = document.documentElement;
const cleanups = [];
const listen = (target, type, handler, options) => {
  target.addEventListener(type, handler, options);
  cleanups.push(() => target.removeEventListener(type, handler, options));
};
const safe = (fn, label) => {
  try {
    return fn();
  } catch (error) {
    marinara?.log?.warn?.(`Mallang: ${label || "step"} failed`, error);
    return undefined;
  }
};
const later = (fn, ms) => (marinara?.setTimeout ? marinara.setTimeout(fn, ms) : window.setTimeout(fn, ms));
const cancel = (id) => (marinara?.clearTimeout ? marinara.clearTimeout(id) : window.clearTimeout(id));

// ---- settings (marinara.storage) ----
let settings = { motion: "on" };
const loaded = await safe(() => marinara?.storage?.get?.(), "storage read");
if (loaded && (loaded.motion === "on" || loaded.motion === "off")) settings.motion = loaded.motion;
let saveTimer = null;
const saveSettings = () => {
  if (saveTimer) cancel(saveTimer);
  saveTimer = later(() => {
    saveTimer = null;
    Promise.resolve(safe(() => marinara?.storage?.patch?.({ motion: settings.motion }), "storage write")).catch(() => {});
  }, 300);
};
const applyMotion = () => {
  if (settings.motion === "off") root.setAttribute("data-mallang-motion", "off");
  else root.removeAttribute("data-mallang-motion");
};
const api = {
  setMotion(value) {
    settings.motion = value === "off" ? "off" : "on";
    applyMotion();
    saveSettings();
  },
  getSettings: () => ({ ...settings }),
};
window.__mallang = api;
cleanups.push(() => {
  if (window.__mallang === api) delete window.__mallang;
});

// ---- on switch ----
root.setAttribute("data-mallang", "on");
applyMotion();

// Marinara paints html/body (iOS safe-area backing) from literal inline colours it computes
// once per theme change; our stylesheet cannot beat inline !important, so mirror that here.
const probe = document.createElement("i");
probe.style.cssText = "position:fixed;width:0;height:0;pointer-events:none;visibility:hidden;background-color:var(--ml-milk)";
const savedBacking = {
  theme: root.getAttribute("data-theme"),
  root: root.style.getPropertyValue("background-color"),
  body: document.body.style.getPropertyValue("background-color"),
  meta: document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? null,
};
let paintTries = 0;
const paintBacking = () => {
  safe(() => {
    document.body.append(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    if (!color || color === "rgba(0, 0, 0, 0)") {
      // The stylesheet may still be loading; try again shortly.
      if (++paintTries < 12) later(paintBacking, 300);
      return;
    }
    root.style.setProperty("background-color", color, "important");
    // body stays clear so the backdrop (z-index -1 under the root) shows through.
    document.body.style.setProperty("background-color", "transparent", "important");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
  }, "page backing");
};
paintBacking();
const themeObserver = new MutationObserver(() => later(paintBacking, 60));
themeObserver.observe(root, { attributes: true, attributeFilter: ["data-theme"] });

// Fonts: Marinara's CSP (style-src 'self' 'unsafe-inline', font-src 'self' data:)
// blocks Google Fonts, so Mallang uses the system Korean font stack from the CSS.

// ---- viewport watcher ----
const mqs = Object.entries(SIZE_QUERIES).map(([name, q]) => [name, window.matchMedia(q)]);
const shortMq = window.matchMedia(SHORT_QUERY);
let lastSize = "";
const syncViewport = () => {
  const hit = mqs.find(([, mq]) => mq.matches);
  const size = hit ? hit[0] : "wide";
  if (size !== lastSize) {
    lastSize = size;
    root.setAttribute("data-mallang-size", size);
    syncNav();
  }
  if (shortMq.matches) root.setAttribute("data-mallang-short", "");
  else root.removeAttribute("data-mallang-short");
};
for (const [, mq] of [...mqs, ["short", shortMq]]) listen(mq, "change", () => syncViewport());

// ---- phone bottom nav ----
let nav = null;
let observer = null;
let observed = null;
let debounce = null;

const chatIsOpen = () => !!document.querySelector('[data-component="CenterContent"] [data-chat-mode]:not(button, a), [data-component="CenterContent"] textarea[data-chat-composer]');
const keyboardOpen = () => root.hasAttribute("data-mari-software-keyboard-open");

const buildNav = () => {
  const el = document.createElement("nav");
  el.className = "mallang-nav";
  el.setAttribute("aria-label", "Mallang");
  el.hidden = true;
  for (const item of NAV_ITEMS) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.mallangNav = item.key;
    const icon = document.createElement("span");
    icon.className = "ml-ic";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = item.icon;
    const label = document.createElement("span");
    label.textContent = item.label;
    button.append(icon, label);
    button.addEventListener("click", () => {
      document.querySelector(item.selector)?.click();
      later(syncNav, 80);
    });
    el.append(button);
  }
  document.body.append(el);
  return el;
};

const syncNav = () => {
  const wantNav = lastSize === "phone" && !chatIsOpen() && !keyboardOpen();
  if (lastSize === "phone" && !nav) nav = buildNav();
  if (nav) {
    nav.hidden = !wantNav;
    for (const button of nav.querySelectorAll("button")) {
      const item = NAV_ITEMS.find((i) => i.key === button.dataset.mallangNav);
      const source = item && document.querySelector(item.selector);
      if (source?.getAttribute("aria-pressed") === "true") button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
  }
  if (wantNav) root.setAttribute("data-mallang-nav", "on");
  else root.removeAttribute("data-mallang-nav");
  if (lastSize !== "phone" && nav) {
    nav.remove();
    nav = null;
  }
};
const scheduleSync = () => {
  if (debounce) cancel(debounce);
  debounce = later(() => {
    debounce = null;
    attachObserver();
    syncNav();
  }, 100);
};
const attachObserver = () => {
  const target = document.querySelector('[data-component="CenterContent"]');
  if (!target || target === observed) return;
  observer?.disconnect();
  observed = target;
  observer = new MutationObserver(scheduleSync);
  observer.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-pressed"] });
};
// The keyboard flag lives on <html>; one more tiny observer would be overkill, so the
// visualViewport / focus events that toggle it re-run the sync.
listen(window, "resize", scheduleSync);
listen(document, "focusin", scheduleSync);
listen(document, "focusout", scheduleSync);
// CenterContent mounts after the first render: poll cheaply (managed timer) until it exists.
let attachTries = 0;
const attachTimer = marinara?.setInterval
  ? marinara.setInterval(() => {
      attachObserver();
      if (observed || ++attachTries > 40) marinara.clearInterval(attachTimer);
    }, 250)
  : null;

syncViewport();
attachObserver();
syncNav();

// ---- conflict check ----
let toast = null;
if (document.getElementById("m98-root")) {
  marinara?.log?.warn?.("Mallang: MARINARA98 is active (#m98-root). Running both can break the layout.");
  toast = document.createElement("div");
  toast.className = "mallang-toast";
  toast.setAttribute("role", "status");
  const text = document.createElement("span");
  text.textContent = "MARINARA98과 함께 켜면 화면이 깨질 수 있어요";
  const close = document.createElement("button");
  close.type = "button";
  close.setAttribute("aria-label", "닫기");
  close.textContent = "×";
  close.addEventListener("click", () => {
    toast?.remove();
    toast = null;
  });
  toast.append(text, close);
  document.body.append(toast);
}

// ---- backdrop: soft pastel blobs + one dashed doodle line, behind the app ----
const backdrop = document.createElement("div");
backdrop.className = "mallang-backdrop";
backdrop.setAttribute("aria-hidden", "true");
for (const name of ["peach", "mint", "lav", "line"]) {
  const el = document.createElement("i");
  el.className = `ml-${name}`;
  backdrop.append(el);
}
document.body.prepend(backdrop);

// ---- home hero: big greeting + this week's date strip ----
const hero = document.createElement("div");
hero.className = "mallang-hero";
const heroTitle = document.createElement("h2");
heroTitle.className = "mlg-title";
const week = document.createElement("ol");
week.className = "mlg-week";
week.setAttribute("aria-hidden", "true");
hero.append(heroTitle, week);
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
let weekKey = "";
const renderWeek = () => {
  const today = new Date();
  const key = today.toDateString();
  if (key === weekKey) return;
  weekKey = key;
  // Monday-first week around today.
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    const li = document.createElement("li");
    if (day.toDateString() === key) li.className = "is-today";
    const name = document.createElement("span");
    name.textContent = DAY_NAMES[day.getDay()];
    const num = document.createElement("b");
    num.textContent = String(day.getDate());
    li.append(name, num);
    days.push(li);
  }
  week.replaceChildren(...days);
};
renderWeek();
const weekTimer = marinara?.setInterval ? marinara.setInterval(renderWeek, 60000) : null;
const syncHero = () => {
  const host = document.querySelector(".mari-home-hero");
  if (!host) return;
  if (hero.parentElement !== host) {
    // Reuse the engine's own greeting so it follows the UI language.
    heroTitle.textContent = host.querySelector("h1")?.textContent?.trim() || "오늘은 어떤 이야기를 시작할까요?";
    host.prepend(hero);
  }
};

// ---- current view (home / chat / other) for view-specific styling ----
let viewDebounce = null;
const syncView = () => {
  const view = chatIsOpen() ? "chat" : document.querySelector('[data-component="HomeBrowserHub"]') ? "home" : "other";
  if (root.getAttribute("data-mallang-view") !== view) root.setAttribute("data-mallang-view", view);
  syncHero();
};
const viewObserver = new MutationObserver(() => {
  if (!viewDebounce) viewDebounce = later(() => {
    viewDebounce = null;
    syncView();
  }, 120);
});
viewObserver.observe(document.getElementById("root") || document.body, { childList: true, subtree: true });
syncView();

marinara?.log?.info?.("Mallang 0.3.0 started");

// ---- cleanup ----
marinara.onCleanup(() => {
  if (debounce) cancel(debounce);
  if (saveTimer) cancel(saveTimer);
  if (attachTimer && marinara.clearInterval) marinara.clearInterval(attachTimer);
  observer?.disconnect();
  observer = null;
  themeObserver.disconnect();
  viewObserver.disconnect();
  if (viewDebounce) cancel(viewDebounce);
  if (weekTimer && marinara.clearInterval) marinara.clearInterval(weekTimer);
  backdrop.remove();
  hero.remove();
  probe.remove();
  for (const fn of cleanups.splice(0).reverse()) safe(fn, "cleanup");
  nav?.remove();
  nav = null;
  toast?.remove();
  toast = null;
  safe(() => {
    const restore = (el, value) => (value ? el.style.setProperty("background-color", value, "important") : el.style.removeProperty("background-color"));
    if (root.getAttribute("data-theme") === savedBacking.theme) {
      restore(root, savedBacking.root);
      restore(document.body, savedBacking.body);
      if (savedBacking.meta) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", savedBacking.meta);
    }
  }, "restore backing");
  for (const name of ["data-mallang", "data-mallang-size", "data-mallang-short", "data-mallang-nav", "data-mallang-motion", "data-mallang-view"]) {
    root.removeAttribute(name);
  }
});
