// Everything the video says lives here. Edit this file and re-run `npm run render`.
// Scene timings are fixed to the music (120 BPM, one bar = 2 s); texts can be any length that fits.
// DRAFT: feature names, bot usernames and package prices below are sample copy until the real ones arrive.
window.CONTENT = {
  draft: true,

  brand: {
    fa: 'تالر',
    en: 'THALER',
    url: 'www.thaler.ir',
    tagline: 'هر چیزی که لازم داری، در یک جا',
  },

  // Scene 2: website (4 cards, 2x2)
  website: {
    kicker: '۰۱ · وبسایت',
    title: 'وبسایت تالر',
    features: [
      { icon: 'user-plus', title: 'ثبت‌نام سریع', desc: 'در کمتر از یک دقیقه' },
      { icon: 'layout-dashboard', title: 'پنل کاربری', desc: 'همه‌چیز زیر یک نگاه' },
      { icon: 'shield-check', title: 'پرداخت امن', desc: 'درگاه مطمئن آنلاین' },
      { icon: 'headphones', title: 'پشتیبانی', desc: 'همیشه کنار شما' },
    ],
  },

  // Scenes 3 and 4: bots (a chat window each)
  telegram: {
    kicker: '۰۲ · تلگرام',
    title: 'ربات تلگرام',
    sub: 'همه امکانات سایت، داخل تلگرام',
    handle: '@thaler_bot',
    userMsg: '/start',
    botMsg: 'سلام! به تالر خوش اومدی 👋\nچه کاری برات انجام بدم؟',
    buttons: ['خرید پکیج', 'حساب من', 'پیگیری سفارش', 'پشتیبانی'],
  },
  bale: {
    kicker: '۰۳ · بله',
    title: 'ربات بله',
    sub: 'همون تجربه کامل، داخل پیام‌رسان بله',
    handle: '@thaler_bot',
    userMsg: 'سلام',
    botMsg: 'سلام! تالر حالا توی بله هم هست ✨\nاز کجا شروع کنیم؟',
    buttons: ['خرید پکیج', 'تمدید اشتراک', 'اعلان‌ها', 'پشتیبانی'],
  },

  // Scene 5: packages (3 cards; `featured` gets the gold treatment)
  packages: {
    kicker: '۰۴ · پکیج‌ها',
    title: 'پکیج‌های تالر',
    sub: 'مناسب هر نیاز و هر بودجه',
    unit: 'تومان',
    badge: 'پیشنهاد ویژه',
    items: [
      { tier: 'bronze', name: 'برنزی', meta: 'یک ماهه · امکانات پایه', price: 99000 },
      { tier: 'silver', name: 'نقره‌ای', meta: 'سه ماهه · امکانات کامل', price: 249000 },
      { tier: 'gold', name: 'طلایی', meta: 'شش ماهه · همه امکانات', price: 449000, featured: true },
    ],
  },

  // Scene 6: call to action
  cta: {
    title: 'همین حالا شروع کن',
    sub: 'از سایت، تلگرام یا بله',
  },

  // Bilingual subtitles: [start, end, English, German] in seconds
  subtitles: [
    [0.7, 3.8, 'Thaler — everything you need, in one place', 'Thaler – alles, was du brauchst, an einem Ort'],
    [4.2, 5.6, 'The Thaler website', 'Die Thaler-Website'],
    [5.6, 6.7, 'Sign up in under a minute', 'Registrierung in unter einer Minute'],
    [6.7, 7.8, 'Your dashboard — everything at a glance', 'Dein Dashboard – alles auf einen Blick'],
    [7.8, 8.9, 'Secure online payment', 'Sichere Online-Zahlung'],
    [8.9, 9.9, 'Support that’s always there for you', 'Support, der immer für dich da ist'],
    [10.2, 12.1, 'Telegram bot: the whole website inside Telegram', 'Telegram-Bot: die ganze Website in Telegram'],
    [12.1, 13.9, 'Buy, manage and get support in a tap', 'Kaufen, verwalten, Support – mit einem Tipp'],
    [14.2, 16.1, 'Bale bot: the same full experience on Bale', 'Bale-Bot: dasselbe volle Erlebnis in Bale'],
    [16.1, 17.9, 'Renewals, alerts and support — right in the chat', 'Verlängerung, Hinweise, Support – direkt im Chat'],
    [18.2, 21.0, 'Thaler packages — for every need and budget', 'Thaler-Pakete – für jeden Bedarf und jedes Budget'],
    [21.0, 23.9, 'Our best value: the Gold package', 'Unser bestes Angebot: das Gold-Paket'],
    [24.3, 27.2, 'Start now — on the web, Telegram or Bale', 'Jetzt starten – im Web, auf Telegram oder Bale'],
    [27.2, 30.0, 'Visit www.thaler.ir', 'Besuche www.thaler.ir'],
  ],
};
