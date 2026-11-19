import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Languages } from "lucide-react";

import { Button } from "@/components/ui/button";

export type Lang = "en" | "fa";

const en = {
  "app.tagline": "Watch parties, perfectly in sync",
  "landing.subtitle": "One shared player, live chat, and a 6-character code. No account required.",
  "displayName.label": "Your display name",
  "displayName.placeholder": "e.g. Sam",
  createRoom: "Create room",
  orJoin: "or join",
  "roomCode.placeholder": "ROOM CODE",
  join: "Join",
  recentRooms: "Recent rooms",
  keepName: "Want to keep your name across devices?",
  createAccount: "Create an account",
  "error.needName": "Add a display name first.",
  "error.createRoom": "Could not create the room. Please try again.",
  "error.codeLength": "Room codes are 6 characters.",
  "error.noRoom": "No room with that code.",

  "auth.title": "SyncWatch account",
  "auth.subtitle": "Optional — guests can join any room without signing up.",
  signIn: "Sign in",
  signUp: "Sign up",
  createAccountBtn: "Create account",
  "password.placeholder": "Password",
  displayNamePlaceholder: "Display name",
  backToRooms: "Back to rooms",
  "error.signIn": "Sign in could not be completed.",
  "error.pickName": "Pick a display name.",
  checkEmail: "Check your email to confirm your account.",

  "error.joinList": "Could not join the viewer list. Check your connection.",
  "error.sync": "Could not sync that change.",
  fullscreenUnavailable: "Full screen is unavailable in this browser.",
  inviteCopied: "Invite link copied",
  shareLink: "Share this link:",
  roomNotFound: "Room {code} not found",
  roomNotFoundHint: "The code may have expired or been mistyped.",
  backToApp: "Back to SyncWatch",
  joinRoomTitle: "Join room {code}",
  joinRoomHint: "Pick a display name — no account needed.",
  yourName: "Your name",
  "error.addName": "Add a display name.",
  enterRoom: "Enter room",
  cancel: "Cancel",
  copyInvite: "Copy invite link",
  hideChat: "Hide chat",
  chat: "Chat",
  watching: "Watching",
  host: "host",

  "source.none": "No video selected",
  "source.youtube": "YouTube",
  "source.vimeo": "Vimeo",
  "source.file": "Direct video link",
  "source.upload": "Uploaded file",
  "source.other": "Embedded link",

  "chat.sayHi": "Say hi to the room 👋",
  "chat.placeholder": "Message the room…",
  "chat.send": "Send message",
  "chat.sendFailed": "Message not sent. Check your connection and try again.",
  "chat.typing": "typing…",
  "chat.andOthers": "and others",

  "sync.synced": "In sync",
  "sync.syncing": "Syncing…",
  "sync.off": "Sync unavailable",
  live: "Live",
  "aria.seek": "Seek",
  "aria.back10": "Back 10 seconds",
  "aria.pause": "Pause",
  "aria.play": "Play",
  "aria.forward10": "Forward 10 seconds",
  "aria.unmute": "Unmute",
  "aria.mute": "Mute",
  "aria.volume": "Volume",
  "aria.syncAll": "Bring everyone to my position",
  "aria.exitFullscreen": "Exit full screen",
  "aria.fullscreen": "Full screen",

  "tab.link": "Paste link",
  "tab.upload": "Upload",
  "search.placeholder": "Search YouTube…",
  "search.aria": "Search YouTube",
  "ytLink.placeholder": "…or paste a YouTube link",
  load: "Load",
  "error.searchFailed": "Search failed. Try pasting a link instead.",
  noVideosFound: "No videos found.",
  "error.notYoutube": "That doesn't look like a YouTube link.",
  "error.needHttps": "Paste a full link starting with https://",
  loadedAs: "Loaded as {label}",
  aparatFound: "Found the real Aparat video — everyone stays in sync.",
  aparatFallback:
    "Aparat didn't share the video file, so it plays in Aparat's own player. Press play together; sync isn't guaranteed here.",
  noControllable: "No controllable video found — embedding without sync.",
  pageNotChecked: "The page could not be checked — embedding without sync.",
  videosFound: "Videos found on this page — pick one:",
  embedPageInstead: "None of these — embed the whole page instead",
  linkHint:
    "Paste the page where the movie plays — SyncWatch looks for the real video inside it so everyone stays in sync.",
  uploading: "Uploading…",
  paused: "Paused",
  resume: "Resume",
  pause: "Pause",
  uploadResumeHint:
    "If you leave, pick the same file again later — the upload continues where it stopped.",
  chooseVideo: "Choose a video from your phone or computer",
  uploadFormats: "MP4, MOV, WebM, MKV, M4V, 3GP · up to 2 GB · resumable",
  alreadyUploaded: "Already uploaded — playing it right away.",
  uploadStopped: "Upload stopped. Pick the same file again to continue where it left off.",
  uploadStartFailed: "Upload could not start. Please select the file again.",
  uploadReady: "Upload ready — everyone streams from this file.",
  continuingUpload: "Continuing your earlier upload…",
  roomLibrary: "Room library — no need to upload again",
  syncedChip: "synced",
  formatWarning: "This format may not play in every browser. MP4 (H.264) works everywhere.",
  "upload.notVideo": "Please choose a video file.",
  "upload.empty": "That file is empty.",
  "upload.tooBig": "That file is larger than 2 GB.",

  pickSomething: "Pick something to watch to get started.",
  syncNotGuaranteed: "Sync not guaranteed for this source",
  embedBlocked: "If the site blocks embedding, open it directly:",
  loadingVideo: "Loading video…",
  "error.uploadLoad": "This uploaded video could not be loaded.",
  "error.noStreamSupport": "This browser cannot play this stream.",
  "error.streamLoad": "This stream could not be loaded. Try another video link.",
  "error.streamPlayer": "The stream player could not load.",
  "error.youtubeLoad": "YouTube could not be loaded. Check your connection.",
  "error.vimeoLoad": "Vimeo could not be loaded. Check your connection.",
  mutedNotice: "Playing muted — raise the volume to hear it",
  "error.videoPlay":
    "This video could not be played. The link may be broken, blocked by its site, or in a format this browser can't play (try MP4 H.264 or WebM).",
  "email.label": "Email",
  "link.placeholder": "Page link, iframe embed code, Aparat, Vimeo, .mp4/.m3u8…",
  "aparat.title": "Aparat video",
  "embedded.title": "Embedded video",
  "error.signUp": "Account could not be created. Check your details and try again.",
  "error.searchUnavailable": "YouTube search is unavailable right now. Try pasting a link instead.",
  "page.notFound": "Page not found",
  "page.notFoundHint": "The page you're looking for doesn't exist or has been moved.",
  "page.error": "This page didn't load",
  "page.errorHint": "Something went wrong on our end. You can try refreshing or head back home.",
  retry: "Try again",
  goHome: "Go home",
};

export type MessageKey = keyof typeof en;

const fa: Record<MessageKey, string> = {
  "app.tagline": "مهمانی تماشای فیلم، کاملاً هم‌زمان",
  "landing.subtitle": "یک پخش‌کننده مشترک، گفتگوی زنده و یک کد ۶ حرفی. بدون نیاز به حساب کاربری.",
  "displayName.label": "نام نمایشی شما",
  "displayName.placeholder": "مثلاً سارا",
  createRoom: "ساخت اتاق",
  orJoin: "یا وارد شوید",
  "roomCode.placeholder": "کد اتاق",
  join: "ورود",
  recentRooms: "اتاق‌های اخیر",
  keepName: "می‌خواهید نامتان روی همه دستگاه‌ها بماند؟",
  createAccount: "ساخت حساب کاربری",
  "error.needName": "اول یک نام نمایشی بنویسید.",
  "error.createRoom": "ساخت اتاق ممکن نشد. دوباره تلاش کنید.",
  "error.codeLength": "کد اتاق ۶ حرف است.",
  "error.noRoom": "اتاقی با این کد پیدا نشد.",

  "auth.title": "حساب کاربری SyncWatch",
  "auth.subtitle": "اختیاری است — مهمان‌ها بدون ثبت‌نام وارد هر اتاقی می‌شوند.",
  signIn: "ورود",
  signUp: "ثبت‌نام",
  createAccountBtn: "ساخت حساب",
  "password.placeholder": "رمز عبور",
  displayNamePlaceholder: "نام نمایشی",
  backToRooms: "بازگشت به اتاق‌ها",
  "error.signIn": "ورود انجام نشد.",
  "error.pickName": "یک نام نمایشی انتخاب کنید.",
  checkEmail: "برای تأیید حساب، ایمیل‌تان را بررسی کنید.",

  "error.joinList": "ورود به فهرست تماشاگران ممکن نشد. اتصال‌تان را بررسی کنید.",
  "error.sync": "هم‌زمان‌سازی این تغییر ممکن نشد.",
  fullscreenUnavailable: "تمام‌صفحه در این مرورگر پشتیبانی نمی‌شود.",
  inviteCopied: "پیوند دعوت کپی شد",
  shareLink: "این پیوند را بفرستید:",
  roomNotFound: "اتاق {code} پیدا نشد",
  roomNotFoundHint: "ممکن است کد اشتباه نوشته شده یا منقضی شده باشد.",
  backToApp: "بازگشت به SyncWatch",
  joinRoomTitle: "ورود به اتاق {code}",
  joinRoomHint: "یک نام نمایشی انتخاب کنید — بدون نیاز به حساب.",
  yourName: "نام شما",
  "error.addName": "یک نام نمایشی بنویسید.",
  enterRoom: "ورود به اتاق",
  cancel: "انصراف",
  copyInvite: "کپی پیوند دعوت",
  hideChat: "بستن گفتگو",
  chat: "گفتگو",
  watching: "در حال تماشا",
  host: "میزبان",

  "source.none": "هنوز ویدیویی انتخاب نشده",
  "source.youtube": "یوتیوب",
  "source.vimeo": "ویمیو",
  "source.file": "پیوند مستقیم ویدیو",
  "source.upload": "فایل آپلودشده",
  "source.other": "پیوند جاسازی‌شده",

  "chat.sayHi": "به اتاق سلام کنید 👋",
  "chat.placeholder": "پیام خود را بنویسید…",
  "chat.send": "ارسال پیام",
  "chat.sendFailed": "پیام ارسال نشد. اتصال‌تان را بررسی کنید و دوباره بفرستید.",
  "chat.typing": "در حال نوشتن…",
  "chat.andOthers": "و بقیه",

  "sync.synced": "هم‌زمان",
  "sync.syncing": "در حال هم‌زمان‌سازی…",
  "sync.off": "بدون هم‌زمان‌سازی",
  live: "زنده",
  "aria.seek": "جابه‌جایی در فیلم",
  "aria.back10": "۱۰ ثانیه عقب",
  "aria.pause": "مکث",
  "aria.play": "پخش",
  "aria.forward10": "۱۰ ثانیه جلو",
  "aria.unmute": "وصل کردن صدا",
  "aria.mute": "بی‌صدا",
  "aria.volume": "بلندی صدا",
  "aria.syncAll": "آوردن همه به همین لحظه فیلم",
  "aria.exitFullscreen": "خروج از تمام‌صفحه",
  "aria.fullscreen": "تمام‌صفحه",

  "tab.link": "درج پیوند",
  "tab.upload": "آپلود",
  "search.placeholder": "جستجو در یوتیوب…",
  "search.aria": "جستجوی یوتیوب",
  "ytLink.placeholder": "…یا پیوند یوتیوب را بچسبانید",
  load: "بارگیری",
  "error.searchFailed": "جستجو انجام نشد. به‌جای آن پیوند بچسبانید.",
  noVideosFound: "ویدیویی پیدا نشد.",
  "error.notYoutube": "این پیوند یوتیوب به نظر نمی‌رسد.",
  "error.needHttps": "یک پیوند کامل که با https:// شروع می‌شود بچسبانید",
  loadedAs: "به‌عنوان {label} بارگیری شد",
  aparatFound: "ویدیوی اصلی آپارات پیدا شد — همه هم‌زمان تماشا می‌کنند.",
  aparatFallback:
    "آپارات فایل ویدیو را در اختیار نگذاشت، پس در پخش‌کننده خود آپارات نمایش داده می‌شود. پخش را با هم شروع کنید؛ هم‌زمانی تضمین‌شده نیست.",
  noControllable: "ویدیوی قابل‌کنترلی پیدا نشد — بدون هم‌زمانی جاسازی شد.",
  pageNotChecked: "بررسی صفحه ممکن نشد — بدون هم‌زمانی جاسازی شد.",
  videosFound: "ویدیوهای این صفحه — یکی را انتخاب کنید:",
  embedPageInstead: "هیچ‌کدام — کل صفحه جاسازی شود",
  linkHint:
    "پیوند صفحه‌ای که فیلم در آن پخش می‌شود را بچسبانید — SyncWatch ویدیوی اصلی را پیدا می‌کند تا همه هم‌زمان ببینند.",
  uploading: "در حال آپلود…",
  paused: "متوقف‌شده",
  resume: "ادامه",
  pause: "مکث",
  uploadResumeHint:
    "اگر از برنامه خارج شوید، بعداً همان فایل را دوباره انتخاب کنید — آپلود از همان‌جا ادامه می‌یابد.",
  chooseVideo: "یک ویدیو از گوشی یا رایانه‌تان انتخاب کنید",
  uploadFormats: "MP4، MOV، WebM، MKV، M4V، 3GP · تا ۲ گیگابایت · قابل ادامه از همان‌جا",
  alreadyUploaded: "قبلاً آپلود شده — همین حالا پخش می‌شود.",
  uploadStopped: "آپلود متوقف شد. برای ادامه، همان فایل را دوباره انتخاب کنید.",
  uploadStartFailed: "آپلود شروع نشد. فایل را دوباره انتخاب کنید.",
  uploadReady: "آپلود آماده است — همه از همین فایل تماشا می‌کنند.",
  continuingUpload: "ادامه آپلود قبلی…",
  roomLibrary: "کتابخانه اتاق — بدون نیاز به آپلود دوباره",
  syncedChip: "هم‌زمان",
  formatWarning: "این قالب شاید در همه مرورگرها پخش نشود. MP4 (H.264) همه‌جا کار می‌کند.",
  "upload.notVideo": "لطفاً یک فایل ویدیویی انتخاب کنید.",
  "upload.empty": "این فایل خالی است.",
  "upload.tooBig": "این فایل بزرگ‌تر از ۲ گیگابایت است.",

  pickSomething: "برای شروع، چیزی برای تماشا انتخاب کنید.",
  syncNotGuaranteed: "هم‌زمانی برای این منبع تضمین‌شده نیست",
  embedBlocked: "اگر سایت اجازه جاسازی نداد، مستقیم بازش کنید:",
  loadingVideo: "در حال بارگیری ویدیو…",
  "error.uploadLoad": "ویدیوی آپلودشده بارگیری نشد.",
  "error.noStreamSupport": "این مرورگر نمی‌تواند این پخش زنده را اجرا کند.",
  "error.streamLoad": "پخش زنده بارگیری نشد. پیوند دیگری امتحان کنید.",
  "error.streamPlayer": "پخش‌کننده پخش زنده بارگیری نشد.",
  "error.youtubeLoad": "یوتیوب بارگیری نشد. اتصال‌تان را بررسی کنید.",
  "error.vimeoLoad": "ویمیو بارگیری نشد. اتصال‌تان را بررسی کنید.",
  mutedNotice: "بدون صدا پخش می‌شود — برای شنیدن، صدا را زیاد کنید",
  "error.videoPlay":
    "این ویدیو پخش نشد. ممکن است پیوند خراب باشد، سایت اجازه پخش ندهد یا قالب آن برای این مرورگر ناشناخته باشد (MP4 H.264 یا WebM را امتحان کنید).",
  "email.label": "ایمیل",
  "link.placeholder": "پیوند صفحه، کد iframe، آپارات، ویمیو، ‎.mp4/.m3u8…",
  "aparat.title": "ویدیوی آپارات",
  "embedded.title": "ویدیوی جاسازی‌شده",
  "error.signUp": "ساخت حساب انجام نشد. اطلاعات را بررسی کنید و دوباره تلاش کنید.",
  "error.searchUnavailable": "جستجوی یوتیوب فعلاً در دسترس نیست. پیوند ویدیو را وارد کنید.",
  "page.notFound": "صفحه پیدا نشد",
  "page.notFoundHint": "صفحه موردنظر وجود ندارد یا جابه‌جا شده است.",
  "page.error": "این صفحه بارگیری نشد",
  "page.errorHint": "مشکلی در بارگیری رخ داد. دوباره تلاش کنید یا به صفحه اصلی برگردید.",
  retry: "تلاش دوباره",
  goHome: "صفحه اصلی",
};

const dictionaries: Record<Lang, Record<MessageKey, string>> = { en, fa };

const STORAGE_KEY = "syncwatch.lang";

function detectLang(): Lang {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "fa") return stored;
  return navigator.language?.toLowerCase().startsWith("fa") ? "fa" : "en";
}

type I18nContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: MessageKey, vars?: Record<string, string>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    setLangState(detectLang());
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = (next: Lang) => {
    setLangState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  };

  const t = (key: MessageKey, vars?: Record<string, string>) => {
    let text = dictionaries[lang][key] ?? en[key] ?? key;
    if (vars)
      for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, value);
    return text;
  };

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Outside the provider (shouldn't happen) — fall back to English.
    return {
      lang: "en",
      setLang: () => {},
      t: (key, vars) => {
        let text: string = en[key] ?? key;
        if (vars)
          for (const [name, value] of Object.entries(vars))
            text = text.replaceAll(`{${name}}`, value);
        return text;
      },
    };
  }
  return ctx;
}

/** Small toggle shown on the landing and room headers. */
export function LanguageToggle() {
  const { lang, setLang } = useI18n();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setLang(lang === "fa" ? "en" : "fa")}
      aria-label={lang === "fa" ? "Switch to English" : "تغییر به فارسی"}
    >
      <Languages className="size-4" />
      {lang === "fa" ? "EN" : "فارسی"}
    </Button>
  );
}
