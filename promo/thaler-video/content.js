// Everything the video says lives here. Edit this file and re-run `npm run render`.
// Scene timings are fixed to the music (120 BPM, one bar = 2 s); texts can be any length that fits.
window.CONTENT = {
  draft: false,

  brand: {
    fa: 'تالر',
    en: 'THALER',
    mark: 'DE', // the badge in the site logo, stamped on the coin
    url: 'www.thaler.ir',
    hook: ['آلمانی را یاد بگیر،', 'نه اینکه دوباره فراموش کنی.'],
  },

  // Scene 2: spaced repetition + word bank
  review: {
    kicker: '۰۱ · مرور هوشمند',
    title: 'مرور هوشمند با <g>FSRS</g>',
    sub: 'همان موتوری که Anki استفاده می‌کند',
    cards: [
      { art: 'die', word: 'Pflege' },
      { art: 'der', word: 'Alltag', back: 'روزمره', next: 'مرور بعدی: ۶ روز دیگر' },
      { art: 'das', word: 'Ziel' },
    ],
    words: 100000,
    wordsLabel: 'واژه در بانک لغات',
    books: 'واژگان کتاب‌های Menschen و Sicher، دسته‌بندی‌شده تا سطح درس',
  },

  // Scene 3: six feature cards (2 × 3), highlighted in pairs
  features: {
    kicker: '۰۲ · امکانات',
    title: 'هر چهار مهارت، <g>یک‌جا</g>',
    sub: 'گفتار · شنیدار · خواندن و نوشتن · گرامر',
    path: 'thaler.ir/dashboard',
    items: [
      { icon: 'route', title: 'مسیر گرامر', desc: 'از Artikel تا Konjunktiv II' },
      { icon: 'bot', title: 'شبیه‌ساز مکالمه', desc: 'صحبت صوتی با هوش مصنوعی' },
      { icon: 'pen', title: 'تصحیح نوشتار', desc: 'خطا + قاعده به فارسی' },
      { icon: 'mic', title: 'تلفظ و شادوئینگ', desc: 'با تشخیص گفتار' },
      { icon: 'music', title: 'موزیک و پادکست', desc: 'ویدیو و داستان A1 تا B2' },
      { icon: 'cap', title: 'آزمون آزمایشی', desc: 'Goethe · ÖSD · telc' },
    ],
  },

  // Scenes 4 and 5: the dictionary bot on Telegram, then Bale
  telegram: {
    kicker: '۰۳ · تلگرام',
    title: 'ربات دیکشنری',
    sub: 'واژه را بفرست؛ معنی، آرتیکل، تلفظ و مثال بگیر',
    name: 'دیکشنری تالر',
    handle: '@ThalerWortBot',
    query: 'Alltag',
    art: 'der', word: 'Alltag', meaning: 'زندگی روزمره', ipa: '/ˈalˌtaːk/',
    example: 'Im Alltag spreche ich Deutsch.', exampleFa: 'در زندگی روزمره آلمانی حرف می‌زنم.',
  },
  bale: {
    kicker: '۰۴ · بله',
    title: 'ربات بله',
    sub: 'همان دیکشنری — از داخل ایران، بدون فیلترشکن',
    name: 'دیکشنری تالر',
    handle: 'thaler_bot',
    query: 'Pflege',
    art: 'die', word: 'Pflege', meaning: 'مراقبت، پرستاری', ipa: '/ˈpfleːɡə/',
    example: 'Die Pflege von Pflanzen macht Spaß.', exampleFa: 'مراقبت از گیاهان لذت‌بخش است.',
  },

  // Scene 6: plans (`featured` gets the highlight)
  plans: {
    kicker: '۰۵ · تعرفه‌ها',
    title: 'هرچه بلندمدت‌تر، <g>به‌صرفه‌تر</g>',
    sub: 'همه‌ی پلن‌ها به تمام امکانات دسترسی کامل می‌دهند',
    unit: 'تومان',
    badge: 'پیشنهاد ما',
    note: 'با کد معرف ۵٪ تخفیف · پرداخت با کارت بانکی یا ارز دیجیتال',
    items: [
      { months: '۱', name: 'اشتراک ۱ ماهه', monthly: 'ماهانه ۷۹۹٬۰۰۰ تومان', price: 799000 },
      { months: '۳', name: 'اشتراک ۳ ماهه', monthly: 'ماهانه ۶۶۶٬۳۳۳ تومان', off: '۱۷٪ تخفیف', price: 1999000 },
      { months: '۶', name: 'اشتراک ۶ ماهه', monthly: 'ماهانه ۵۹۹٬۸۳۳ تومان', off: '۲۵٪ تخفیف', price: 3599000, featured: true },
      { months: '۱۲', name: 'اشتراک سالیانه', monthly: 'ماهانه ۵۴۱٬۵۸۳ تومان', off: '۳۲٪ تخفیف', price: 6499000 },
    ],
  },

  // Scene 7: call to action
  cta: {
    title: '<g>رایگان</g> شروع کن',
    sub: 'نسخه‌ی رایگان همیشه فعال · بدون نیاز به کارت بانکی',
  },

  // Bilingual subtitles: [start, end, English, German] in seconds
  subtitles: [
    [0.7, 3.8, 'Learn German — instead of forgetting it again', 'Deutsch lernen – statt es wieder zu vergessen'],
    [4.2, 6.0, 'Smart review with FSRS — the same engine Anki uses', 'Smartes Wiederholen mit FSRS – wie bei Anki'],
    [6.0, 7.9, 'A 100,000-word vocabulary bank', 'Eine Wortschatz-Datenbank mit 100.000 Wörtern'],
    [8.2, 10.1, 'Structured grammar path · AI conversation partner', 'Strukturierter Grammatikpfad · KI-Gesprächspartner'],
    [10.1, 12.1, 'AI writing correction · pronunciation & shadowing', 'KI-Textkorrektur · Aussprache & Shadowing'],
    [12.1, 13.9, 'Music, podcasts, stories · Goethe/ÖSD/telc mock exams', 'Musik, Podcasts, Geschichten · Probeprüfungen'],
    [14.2, 16.1, 'Telegram dictionary bot: just send a word…', 'Telegram-Wörterbuch-Bot: Schick einfach ein Wort …'],
    [16.1, 17.9, '…get meaning, article, pronunciation and an example', '… und bekomm Bedeutung, Artikel, Aussprache, Beispiel'],
    [18.2, 20.1, 'Also on Bale — works inside Iran without a VPN', 'Auch auf Bale – im Iran ohne VPN nutzbar'],
    [20.1, 21.9, 'Look up words without even opening the site', 'Wörter nachschlagen, ohne die Website zu öffnen'],
    [22.2, 25.0, 'Plans: the longer, the better the value', 'Tarife: Je länger, desto günstiger'],
    [25.0, 27.9, 'Every plan unlocks everything · 6 months: 25% off', 'Jeder Tarif schaltet alles frei · 6 Monate: 25 % Rabatt'],
    [28.3, 30.6, 'Start free — no bank card needed', 'Kostenlos starten – keine Bankkarte nötig'],
    [30.6, 32.0, 'Visit www.thaler.ir', 'Besuche www.thaler.ir'],
  ],
};
