/**
 * UI strings for the Multi Learning surface in the four learner languages.
 * Card CONTENT (course names, lesson text, exam questions) is translated
 * server-side; these are only the page's own labels. Anna's replies come from
 * the agent in the learner's language.
 */

import type { LearnerLanguage } from './api'

export interface TutorStrings {
  pageTitle: string
  pageSubtitle: string
  coursesButton: string
  placeholder: string
  couldNotLoad: string
  tryAgain: string
  continue: string
  done: string
  yourCourses: string
  pickOne: string
  noCourses: string
  start: string
  resume: string
  review: string
  complete: string
  notStarted: string
  introductionKind: string
  unitN: (n: number) => string
  letsBegin: string
  whatYoullLearn: string
  videoKind: string
  watchToContinue: string
  watched: string
  readingKind: string
  keyPoints: string
  actionPlanKind: string
  actionPlanHint: string
  planPlaceholder: string
  savePlan: string
  savingPlan: string
  planSaved: string
  finalExamKind: string
  questionOf: (i: number, total: number) => string
  attemptsLeft: (n: number) => string
  previous: string
  next: string
  submit: string
  submitting: string
  passedTitle: string
  notPassedTitle: string
  correctOf: (c: number, total: number) => string
  passMark: (p: number) => string
  noAttemptsLeft: string
  alreadyPassed: string
  /** The visible message sent when the learner picks a course on the card. */
  openCourseMessage: (name: string) => string
  unitsComplete: (done: number, total: number) => string
  courseComplete: string
  stepNow: string
  showProgress: string
  hideRail: string
  showRail: string
  close: string
  bestScore: (s: number) => string
  voiceOn: string
  voiceOff: string
  chooseCourse: string
  showAllCourses: string
  nowStep: (step: string) => string
  earnsCertificate: string
  language: string
}

const en: TutorStrings = {
  pageTitle: 'Multi Learning',
  pageSubtitle: 'Anna tutors you through a course, one step at a time',
  coursesButton: 'Courses',
  placeholder: 'Reply to Anna, or tap the mic and speak',
  couldNotLoad: 'This couldn’t be loaded.',
  tryAgain: 'Try again',
  continue: 'Continue',
  done: 'Done',
  yourCourses: 'Your courses',
  pickOne: 'Pick one to learn with Anna',
  noCourses: 'You’re not enrolled in any course yet. Enrol from the Courses page first.',
  start: 'Start',
  resume: 'Resume',
  review: 'Review',
  complete: 'Complete',
  notStarted: 'Not started',
  introductionKind: 'Introduction',
  unitN: (n) => `Unit ${n}`,
  letsBegin: 'Let’s begin this unit. Anna will guide you through it.',
  whatYoullLearn: 'What you’ll learn',
  videoKind: 'Video',
  watchToContinue: 'Watch the video to continue',
  watched: 'Watched',
  readingKind: 'Reading',
  keyPoints: 'Key points',
  actionPlanKind: 'Action plan',
  actionPlanHint: 'Your own words. Anna can help if you ask her, but the plan is yours.',
  planPlaceholder: 'Write your plan here…',
  savePlan: 'Save my plan',
  savingPlan: 'Saving…',
  planSaved: 'Plan saved',
  finalExamKind: 'Final exam',
  questionOf: (i, total) => `Question ${i} of ${total}`,
  attemptsLeft: (n) => `${n} attempts left`,
  previous: 'Previous',
  next: 'Next',
  submit: 'Submit',
  submitting: 'Submitting…',
  passedTitle: 'Passed!',
  notPassedTitle: 'Not passed yet',
  correctOf: (c, total) => `${c} of ${total} correct`,
  passMark: (p) => `pass mark ${p}%`,
  noAttemptsLeft: 'no attempts left',
  alreadyPassed: 'You already passed this exam.',
  openCourseMessage: (name) => `Let's start "${name}".`,
  unitsComplete: (done, total) => `${done} of ${total} units complete`,
  courseComplete: 'Course complete',
  stepNow: 'Now',
  showProgress: 'Show course progress',
  hideRail: 'Hide the course panel',
  showRail: 'Show the course panel',
  close: 'Close',
  bestScore: (s) => `best ${s}%`,
  voiceOn: 'Voice replies on',
  voiceOff: 'Voice replies off',
  chooseCourse: 'Choose a course',
  showAllCourses: 'Show my courses in the chat',
  nowStep: (step) => `Now: ${step.toLowerCase()}`,
  earnsCertificate: 'Earns your certificate',
  language: 'Language',
}

const ar: TutorStrings = {
  pageTitle: 'التعلّم التفاعلي',
  pageSubtitle: 'آنا ترافقك في الدورة خطوة بخطوة',
  coursesButton: 'الدورات',
  placeholder: 'ردّ على آنا، أو اضغط الميكروفون وتحدّث',
  couldNotLoad: 'تعذّر تحميل هذا المحتوى.',
  tryAgain: 'حاول مجددًا',
  continue: 'متابعة',
  done: 'تم',
  yourCourses: 'دوراتك',
  pickOne: 'اختر دورة لتتعلمها مع آنا',
  noCourses: 'لست مسجلًا في أي دورة بعد، سجّل من صفحة الدورات أولًا.',
  start: 'ابدأ',
  resume: 'أكمل',
  review: 'راجع',
  complete: 'مكتملة',
  notStarted: 'لم تبدأ',
  introductionKind: 'مقدمة',
  unitN: (n) => `الوحدة ${n}`,
  letsBegin: 'لنبدأ هذه الوحدة، سترافقك آنا خطوة بخطوة.',
  whatYoullLearn: 'ماذا ستتعلم',
  videoKind: 'فيديو',
  watchToContinue: 'شاهد الفيديو للمتابعة',
  watched: 'تمت المشاهدة',
  readingKind: 'قراءة',
  keyPoints: 'النقاط الأساسية',
  actionPlanKind: 'خطة العمل',
  actionPlanHint: 'بكلماتك أنت، يمكن لآنا أن تساعدك إذا سألتها، لكن الخطة خطتك.',
  planPlaceholder: 'اكتب خطتك هنا…',
  savePlan: 'احفظ خطتي',
  savingPlan: 'جارٍ الحفظ…',
  planSaved: 'تم حفظ الخطة',
  finalExamKind: 'الاختبار النهائي',
  questionOf: (i, total) => `السؤال ${i} من ${total}`,
  attemptsLeft: (n) => `${n} محاولات متبقية`,
  previous: 'السابق',
  next: 'التالي',
  submit: 'إرسال',
  submitting: 'جارٍ الإرسال…',
  passedTitle: 'نجحت!',
  notPassedTitle: 'لم تنجح بعد',
  correctOf: (c, total) => `${c} من ${total} إجابات صحيحة`,
  passMark: (p) => `درجة النجاح ${p}٪`,
  noAttemptsLeft: 'لا محاولات متبقية',
  alreadyPassed: 'لقد نجحت في هذا الاختبار من قبل.',
  openCourseMessage: (name) => `لنبدأ دورة «${name}».`,
  unitsComplete: (done, total) => `اكتملت ${done} من ${total} وحدات`,
  courseComplete: 'اكتملت الدورة',
  stepNow: 'الآن',
  showProgress: 'عرض تقدم الدورة',
  hideRail: 'إخفاء لوحة الدورة',
  showRail: 'إظهار لوحة الدورة',
  close: 'إغلاق',
  bestScore: (s) => `أفضل نتيجة ${s}٪`,
  voiceOn: 'الردود الصوتية مفعّلة',
  voiceOff: 'الردود الصوتية متوقفة',
  chooseCourse: 'اختر دورة',
  showAllCourses: 'اعرض دوراتي في المحادثة',
  nowStep: (step) => `الآن: ${step}`,
  earnsCertificate: 'تمنحك شهادتك',
  language: 'اللغة',
}

const hi: TutorStrings = {
  pageTitle: 'मल्टी लर्निंग',
  pageSubtitle: 'अन्ना आपको एक-एक कदम करके कोर्स सिखाती हैं',
  coursesButton: 'कोर्स',
  placeholder: 'अन्ना को जवाब दें, या माइक दबाकर बोलें',
  couldNotLoad: 'यह लोड नहीं हो सका।',
  tryAgain: 'फिर कोशिश करें',
  continue: 'आगे बढ़ें',
  done: 'पूरा हुआ',
  yourCourses: 'आपके कोर्स',
  pickOne: 'अन्ना के साथ सीखने के लिए एक चुनें',
  noCourses: 'आप अभी किसी कोर्स में नामांकित नहीं हैं, पहले कोर्स पेज से नामांकन करें।',
  start: 'शुरू करें',
  resume: 'जारी रखें',
  review: 'दोहराएँ',
  complete: 'पूर्ण',
  notStarted: 'शुरू नहीं हुआ',
  introductionKind: 'परिचय',
  unitN: (n) => `इकाई ${n}`,
  letsBegin: 'चलिए यह इकाई शुरू करें, अन्ना आपका मार्गदर्शन करेंगी।',
  whatYoullLearn: 'आप क्या सीखेंगे',
  videoKind: 'वीडियो',
  watchToContinue: 'आगे बढ़ने के लिए वीडियो देखें',
  watched: 'देख लिया',
  readingKind: 'पठन',
  keyPoints: 'मुख्य बातें',
  actionPlanKind: 'कार्य योजना',
  actionPlanHint: 'अपने शब्दों में, पूछने पर अन्ना मदद कर सकती हैं, पर योजना आपकी है।',
  planPlaceholder: 'अपनी योजना यहाँ लिखें…',
  savePlan: 'मेरी योजना सहेजें',
  savingPlan: 'सहेजा जा रहा है…',
  planSaved: 'योजना सहेज ली गई',
  finalExamKind: 'अंतिम परीक्षा',
  questionOf: (i, total) => `प्रश्न ${i} / ${total}`,
  attemptsLeft: (n) => `${n} प्रयास शेष`,
  previous: 'पिछला',
  next: 'अगला',
  submit: 'जमा करें',
  submitting: 'जमा हो रहा है…',
  passedTitle: 'उत्तीर्ण!',
  notPassedTitle: 'अभी उत्तीर्ण नहीं',
  correctOf: (c, total) => `${total} में से ${c} सही`,
  passMark: (p) => `उत्तीर्ण अंक ${p}%`,
  noAttemptsLeft: 'कोई प्रयास शेष नहीं',
  alreadyPassed: 'आप यह परीक्षा पहले ही उत्तीर्ण कर चुके हैं।',
  openCourseMessage: (name) => `चलिए "${name}" शुरू करें।`,
  unitsComplete: (done, total) => `${total} में से ${done} इकाइयाँ पूर्ण`,
  courseComplete: 'कोर्स पूर्ण',
  stepNow: 'अभी',
  showProgress: 'कोर्स की प्रगति देखें',
  hideRail: 'कोर्स पैनल छिपाएँ',
  showRail: 'कोर्स पैनल दिखाएँ',
  close: 'बंद करें',
  bestScore: (s) => `सर्वश्रेष्ठ ${s}%`,
  voiceOn: 'आवाज़ में जवाब चालू',
  voiceOff: 'आवाज़ में जवाब बंद',
  chooseCourse: 'कोर्स चुनें',
  showAllCourses: 'चैट में मेरे कोर्स दिखाएँ',
  nowStep: (step) => `अभी: ${step}`,
  earnsCertificate: 'आपको प्रमाणपत्र दिलाती है',
  language: 'भाषा',
}

const ur: TutorStrings = {
  pageTitle: 'ملٹی لرننگ',
  pageSubtitle: 'انا آپ کو قدم بہ قدم کورس سکھاتی ہیں',
  coursesButton: 'کورسز',
  placeholder: 'انا کو جواب دیں، یا مائیک دبا کر بولیں',
  couldNotLoad: 'یہ لوڈ نہیں ہو سکا۔',
  tryAgain: 'دوبارہ کوشش کریں',
  continue: 'جاری رکھیں',
  done: 'مکمل',
  yourCourses: 'آپ کے کورسز',
  pickOne: 'انا کے ساتھ سیکھنے کے لیے ایک چنیں',
  noCourses: 'آپ ابھی کسی کورس میں داخل نہیں ہیں، پہلے کورسز کے صفحے سے داخلہ لیں۔',
  start: 'شروع کریں',
  resume: 'جاری رکھیں',
  review: 'دہرائیں',
  complete: 'مکمل',
  notStarted: 'شروع نہیں ہوا',
  introductionKind: 'تعارف',
  unitN: (n) => `یونٹ ${n}`,
  letsBegin: 'آئیے یہ یونٹ شروع کریں، انا قدم قدم پر آپ کی رہنمائی کریں گی۔',
  whatYoullLearn: 'آپ کیا سیکھیں گے',
  videoKind: 'ویڈیو',
  watchToContinue: 'جاری رکھنے کے لیے ویڈیو دیکھیں',
  watched: 'دیکھ لیا',
  readingKind: 'مطالعہ',
  keyPoints: 'اہم نکات',
  actionPlanKind: 'عملی منصوبہ',
  actionPlanHint: 'اپنے الفاظ میں، پوچھنے پر انا مدد کر سکتی ہیں، مگر منصوبہ آپ کا ہے۔',
  planPlaceholder: 'اپنا منصوبہ یہاں لکھیں…',
  savePlan: 'میرا منصوبہ محفوظ کریں',
  savingPlan: 'محفوظ ہو رہا ہے…',
  planSaved: 'منصوبہ محفوظ ہو گیا',
  finalExamKind: 'آخری امتحان',
  questionOf: (i, total) => `سوال ${i} از ${total}`,
  attemptsLeft: (n) => `${n} کوششیں باقی`,
  previous: 'پچھلا',
  next: 'اگلا',
  submit: 'جمع کریں',
  submitting: 'جمع ہو رہا ہے…',
  passedTitle: 'کامیاب!',
  notPassedTitle: 'ابھی کامیاب نہیں',
  correctOf: (c, total) => `${total} میں سے ${c} درست`,
  passMark: (p) => `کامیابی کا معیار ${p}٪`,
  noAttemptsLeft: 'کوئی کوشش باقی نہیں',
  alreadyPassed: 'آپ یہ امتحان پہلے ہی پاس کر چکے ہیں۔',
  openCourseMessage: (name) => `آئیے «${name}» شروع کریں۔`,
  unitsComplete: (done, total) => `${total} میں سے ${done} یونٹ مکمل`,
  courseComplete: 'کورس مکمل',
  stepNow: 'اب',
  showProgress: 'کورس کی پیش رفت دیکھیں',
  hideRail: 'کورس پینل چھپائیں',
  showRail: 'کورس پینل دکھائیں',
  close: 'بند کریں',
  bestScore: (s) => `بہترین ${s}٪`,
  voiceOn: 'آواز میں جواب آن',
  voiceOff: 'آواز میں جواب بند',
  chooseCourse: 'کورس چنیں',
  showAllCourses: 'چیٹ میں میرے کورسز دکھائیں',
  nowStep: (step) => `اب: ${step}`,
  earnsCertificate: 'آپ کو سرٹیفکیٹ دلاتا ہے',
  language: 'زبان',
}

const STRINGS: Record<LearnerLanguage, TutorStrings> = { en, ar, hi, ur }

export function getTutorStrings(lang: LearnerLanguage): TutorStrings {
  return STRINGS[lang] ?? en
}

export const LANGUAGES: Array<{ code: LearnerLanguage; label: string; short: string; dir: 'ltr' | 'rtl' }> = [
  { code: 'en', label: 'English', short: 'EN', dir: 'ltr' },
  { code: 'ar', label: 'العربية', short: 'ع', dir: 'rtl' },
  { code: 'hi', label: 'हिन्दी', short: 'हि', dir: 'ltr' },
  { code: 'ur', label: 'اردو', short: 'اردو', dir: 'rtl' },
]

export function directionOf(lang: LearnerLanguage): 'ltr' | 'rtl' {
  return lang === 'ar' || lang === 'ur' ? 'rtl' : 'ltr'
}
