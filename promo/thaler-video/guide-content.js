// Everything the tutorial video says lives here. Edit and re-run `npm run render:guide`.
// Menu labels, dashboard cards, the writing-correction example and the assistant text are taken from the live site;
// learner data (levels, scores, names, sample sentences) is illustrative.
window.GUIDE = {
  draft: false,
  brand: { fa: 'تالر', en: 'THALER', mark: 'DE', url: 'www.thaler.ir' },

  intro: { title: 'راهنمای <g>تالر</g>', sub: 'همه‌ی بخش‌های سایت در ۹ قدم' },

  // The site's side menu, top to bottom
  menu: [
    ['📊', 'داشبورد'], ['🗺️', 'مسیر شخصی'], ['🧠', 'جعبه لایتنر'], ['📚', 'بانک لغات'], ['🗣️', 'گفتار'],
    ['🎧', 'شنیدار'], ['📖', 'خواندن و نوشتن'], ['📐', 'گرامر و آزمون'], ['🏆', 'رقابت و درآمد'], ['⚙️', 'حساب و پشتیبانی'],
  ],

  steps: [
    { title: 'شروع رایگان و تعیین سطح', path: ['صفحه‌ی اصلی', 'آزمون تعیین سطح'], menu: null,
      hero: { pill: 'الگوریتم FSRS — همان موتوری که Anki استفاده می‌کند', h1: ['آلمانی را یاد بگیر،', 'نه اینکه دوباره فراموش کنی.'],
        primary: 'شروع رایگان مسیر یادگیری 🚀', secondary: 'آزمون تعیین سطح 🎯', note: 'بدون نیاز به کارت بانکی · نسخه‌ی رایگان همیشه فعال' },
      test: { title: 'آزمون تعیین سطح', levels: ['A1', 'A2', 'B1', 'B2', 'C1'], result: 2, label: 'سطح تو', note: 'از همین سطح شروع کن' } },

    { title: 'داشبورد: هر روز از اینجا', path: ['منو', 'داشبورد'], menu: 0,
      review: { title: 'وقت مرور است', badge: 'ویژه', text: '۱۳۱ واژه امروز در آستانه‌ی فراموشی‌اند.', button: 'شروع تمرین امروز 🚀' },
      today: { title: 'مسیر امروز شما', items: ['مرور ۱۳۱ واژه‌ی سررسید', 'اولین تمرین شنیداری', 'درس گرامر: جمع بستن اسم‌ها'] },
      missions: { title: 'ماموریت‌های امروز', from: '۰/۳', to: '۱/۳' } },

    { title: 'جعبه لایتنر و بانک لغات', path: ['منو', 'جعبه لایتنر · بانک لغات'], menu: 2,
      card: { art: 'der', word: 'Alltag', back: 'روزمره', next: 'مرور بعدی: ۶ روز دیگر' },
      search: { placeholder: 'جستجو در ۱۰۰٬۰۰۰ واژه…', query: 'Pflege', art: 'die', word: 'Pflege', meaning: 'مراقبت، پرستاری' } },

    { title: 'گفتار: با هوش مصنوعی حرف بزن', path: ['منو', 'گفتار', 'شبیه‌ساز مکالمه'], menu: 4,
      chips: ['شبیه‌ساز مکالمه (AI)', 'آزمون تلفظ', 'شادوئینگ'],
      said: ['Ich ', 'habe', ' gestern ins Kino gegangen.'], fixed: ['Ich ', 'bin', ' gestern ins Kino gegangen.'],
      note: 'فعل gehen در Perfekt با sein می‌آید' },

    { title: 'شنیدار: گوش بده، همزمان بخوان', path: ['منو', 'شنیدار', 'موزیک و پادکست'], menu: 5,
      chips: ['تمرین شنیداری', 'ویدیوهای آموزشی', 'موزیک و پادکست'],
      track: { title: 'Mein Alltag in Berlin', sub: 'پادکست · سطح A2' },
      lines: [
        ['Ich wohne seit zwei Jahren in Berlin.', 'دو سال است که در برلین زندگی می‌کنم.'],
        ['Jeden Morgen fahre ich mit dem Rad.', 'هر صبح با دوچرخه می‌روم.'],
        ['Am Wochenende treffe ich Freunde.', 'آخر هفته دوستانم را می‌بینم.'],
      ] },

    { title: 'نوشتن: خطا + قاعده به فارسی', path: ['منو', 'خواندن و نوشتن', 'تمرین نوشتن'], menu: 6,
      chips: ['داستان‌های کوتاه', 'تمرین نوشتن', 'لابراتوار جمله‌سازی', 'آزمون املا'],
      text: ['Ich fahre mit ', 'der', 'dem', ' Auto zur Arbeit.'], tag: 'Kasus',
      rule: 'بعد از mit همیشه Dativ می‌آید: das Auto ← mit dem Auto' },

    { title: 'گرامر و آزمون', path: ['منو', 'گرامر و آزمون'], menu: 7,
      lessons: [['Artikel', 'done'], ['Perfekt', 'done'], ['Wechselpräpositionen', 'now'], ['Konjunktiv II', 'lock']],
      exam: { title: 'آزمون آزمایشی', sub: 'Goethe · ÖSD · telc' },
      report: { title: 'کارنامه‌ی مهارتی', skills: [['Lesen', .78], ['Hören', .64], ['Schreiben', .55], ['Sprechen', .47]] } },

    { title: 'رقابت و درآمد', path: ['منو', 'رقابت و درآمد'], menu: 8,
      league: { title: 'لیگ این هفته', contest: 'مسابقه ماهانه · با جایزه', rows: [['مریم', 1240], ['علی', 1210], ['شما', 1180]], you: 2, youTo: 1265 },
      referral: { title: 'دعوت دوستان', friend: ['۵٪', 'تخفیف برای دوستت'], you: ['۱۵٪', 'پورسانت نقدی برای تو'] } },

    { title: 'هر جا گیر کردی', path: ['دستیار هوشمند', 'پشتیبانی و تیکت'], menu: null,
      assistant: { name: 'دستیار هوشمند Thaler', status: 'پاسخگوی سریع (آنلاین)',
        msg: 'سلام! 👋 من دستیار هوشمند تالر هستم. هر پرسشی درباره‌ی سایت و بخش‌هایش دارید بپرسید — یا یکی از این‌ها را بزنید:',
        chips: ['سیستم لایتنر چطور کار میکنه؟', 'آزمون تلفظ (Sprechen) چقدر دقیقه؟'], input: 'هر چیزی درباره‌ی تالر بپرسید…' },
      more: { ticket: 'پشتیبانی و تیکت', telegram: '@ThalerWortBot', bale: 'thaler_bot' } },
  ],

  outro: { title: 'همین حالا <g>رایگان</g> شروع کن', sub: 'نسخه‌ی رایگان همیشه فعال · بدون نیاز به کارت بانکی' },

  // Bilingual subtitles: [start, end, English, German] in seconds
  subtitles: [
    [0.7, 3.8, 'The Thaler guide: the whole site in 9 steps', 'Der Thaler-Guide: die ganze Website in 9 Schritten'],
    [4.2, 7.1, 'Step 1: start free — no bank card needed', 'Schritt 1: Kostenlos starten – ohne Bankkarte'],
    [7.1, 9.9, 'Take the placement test and start at your level', 'Mach den Einstufungstest und starte auf deinem Niveau'],
    [10.2, 13.1, 'Step 2: every day starts on your dashboard', 'Schritt 2: Jeder Tag beginnt auf deinem Dashboard'],
    [13.1, 15.9, 'Due reviews, today’s path and daily missions', 'Fällige Wiederholungen, Tagesplan und Missionen'],
    [16.2, 19.1, 'Step 3: flashcards — FSRS schedules every word', 'Schritt 3: Karteikarten – FSRS plant jedes Wort'],
    [19.1, 21.9, 'Look up any of 100,000 words in the word bank', 'Schlag 100.000 Wörter in der Wortbank nach'],
    [22.2, 25.1, 'Step 4: Speaking — talk to the AI out loud', 'Schritt 4: Sprechen – rede laut mit der KI'],
    [25.1, 27.9, 'It finds your grammar mistakes · plus pronunciation & shadowing', 'Sie findet Grammatikfehler · dazu Aussprache & Shadowing'],
    [28.2, 31.1, 'Step 5: Listening — exercises, videos, music & podcasts', 'Schritt 5: Hören – Übungen, Videos, Musik & Podcasts'],
    [31.1, 33.9, 'Read along as each line plays', 'Lies jede Zeile beim Hören mit'],
    [34.2, 37.1, 'Step 6: Writing — the AI fixes it and explains the rule', 'Schritt 6: Schreiben – die KI korrigiert und erklärt die Regel'],
    [37.1, 39.9, 'Plus short stories, a sentence lab and dictation', 'Dazu Kurzgeschichten, Satzlabor und Diktate'],
    [40.2, 43.1, 'Step 7: a grammar path, lesson by lesson', 'Schritt 7: Ein Grammatikpfad, Lektion für Lektion'],
    [43.1, 45.9, 'Goethe, ÖSD & telc mock exams and a skills report', 'Probeprüfungen für Goethe, ÖSD & telc und ein Kompetenzbericht'],
    [46.2, 49.1, 'Step 8: leagues, word games and monthly prizes', 'Schritt 8: Ligen, Wortspiele und Monatspreise'],
    [49.1, 51.9, 'Invite friends: 5% off for them, 15% cash for you', 'Lade Freunde ein: 5 % Rabatt für sie, 15 % für dich'],
    [52.2, 55.8, 'Step 9: stuck? Ask the smart assistant or open a ticket', 'Schritt 9: Hängst du? Frag den Assistenten oder öffne ein Ticket'],
    [56.3, 60.0, 'Start free today at www.thaler.ir', 'Starte heute kostenlos auf www.thaler.ir'],
  ],
};
